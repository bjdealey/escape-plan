import { randomBytes } from 'node:crypto';
import {
  DEMO_USERS,
  type Invite,
  type LeaveRequestRecord,
  type NotificationType,
  type PlanShareRecord,
  type RenderContext,
  dedupKey,
  emptyPreference,
  renderNotification,
  resolveDelivery,
} from '@escape-plan/engine';
import type { GroupRepository } from '../access.js';
import type { NotificationRecord, NotificationStore, OutboxItem } from './store.js';

export interface NotifierDeps {
  groupRepo: GroupRepository;
  store: NotificationStore;
  baseUrl: string;
  now: () => Date;
}

interface Recipient {
  userId?: number;
  email?: string;
}

const usersById = new Map(DEMO_USERS.map((u) => [u.id, u]));
const nameOf = (id: number | undefined) => (id ? (usersById.get(id)?.name ?? `User ${id}`) : 'Someone');
const emailOf = (id: number) => usersById.get(id)?.email;
const genId = (p: string) => `${p}-${randomBytes(8).toString('hex')}`;

const UNSUB_TTL_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Emit a notification to one recipient. Writes the in-app row (idempotent) and
 * enqueues email/push outbox rows per the recipient's preferences and quiet
 * hours. Never throws — a failure here must not affect the triggering action.
 */
async function emitTo(
  deps: NotifierDeps,
  recipient: Recipient,
  type: NotificationType,
  subjectId: string,
  ctx: RenderContext,
): Promise<void> {
  const content = renderNotification(type, ctx);
  const now = deps.now();
  const nowMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const recipientKey = String(recipient.userId ?? recipient.email);
  const key = dedupKey(type, subjectId, Number(recipient.userId ?? 0)) + `:${recipientKey}`;

  // Unknown-user email recipient (e.g. an invite to a stranger): email only.
  if (recipient.userId === undefined) {
    if (!recipient.email) return;
    await enqueueEmail(deps, { userId: 0, email: recipient.email, type, content, key });
    return;
  }

  const pref = (await deps.store.getPreference(recipient.userId)) ?? emptyPreference(recipient.userId);
  const decision = resolveDelivery(pref, type, nowMinutes);

  if (decision.inapp) {
    const rec: NotificationRecord = {
      id: genId('ntf'),
      userId: recipient.userId,
      type,
      title: content.title,
      body: content.body,
      link: content.link,
      createdAt: now.toISOString(),
      dedupKey: key,
    };
    await deps.store.addInApp(rec);
  }

  if (decision.email !== 'off') {
    const email = recipient.email ?? emailOf(recipient.userId);
    if (email) {
      const nextAttemptAt =
        decision.email === 'defer'
          ? deferUntil(pref.quietHoursEnd, nowMinutes, now).toISOString()
          : now.toISOString();
      await enqueueEmail(deps, { userId: recipient.userId, email, type, content, key, nextAttemptAt });
    }
  }

  if (decision.push !== 'off') {
    const subs = await deps.store.pushSubscriptions(recipient.userId);
    if (subs.length > 0) {
      const nextAttemptAt =
        decision.push === 'defer'
          ? deferUntil(pref.quietHoursEnd, nowMinutes, now).toISOString()
          : now.toISOString();
      await enqueuePush(deps, { userId: recipient.userId, type, content, key, nextAttemptAt });
    }
  }
}

function deferUntil(quietEnd: number | undefined, nowMinutes: number, now: Date): Date {
  if (quietEnd === undefined) return now;
  const delta = (quietEnd - nowMinutes + 1440) % 1440;
  return new Date(now.getTime() + delta * 60_000);
}

async function enqueueEmail(
  deps: NotifierDeps,
  args: { userId: number; email: string; type: NotificationType; content: { title: string; body: string; link: string }; key: string; nextAttemptAt?: string },
): Promise<void> {
  const now = deps.now();
  let unsubscribeToken: string | undefined;
  if (args.userId > 0) {
    unsubscribeToken = randomBytes(24).toString('hex');
    await deps.store.createUnsubToken({
      token: unsubscribeToken,
      userId: args.userId,
      type: args.type,
      expiresAt: new Date(now.getTime() + UNSUB_TTL_MS).toISOString(),
    });
  }
  const item: OutboxItem = {
    id: genId('obx'),
    userId: args.userId,
    email: args.email,
    channel: 'email',
    type: args.type,
    subject: args.content.title,
    body: args.content.body,
    link: args.content.link,
    status: 'pending',
    attempts: 0,
    nextAttemptAt: args.nextAttemptAt ?? now.toISOString(),
    dedupKey: args.key,
    createdAt: now.toISOString(),
    unsubscribeToken,
  };
  await deps.store.enqueueOutbox(item);
}

async function enqueuePush(
  deps: NotifierDeps,
  args: { userId: number; type: NotificationType; content: { title: string; body: string; link: string }; key: string; nextAttemptAt?: string },
): Promise<void> {
  const now = deps.now();
  const item: OutboxItem = {
    id: genId('obx'),
    userId: args.userId,
    channel: 'push',
    type: args.type,
    subject: args.content.title,
    body: args.content.body,
    link: args.content.link,
    status: 'pending',
    attempts: 0,
    nextAttemptAt: args.nextAttemptAt ?? now.toISOString(),
    dedupKey: args.key,
    createdAt: now.toISOString(),
  };
  await deps.store.enqueueOutbox(item);
}

// --- Recipient scoping (reuses the group/role checks) ----------------------

async function approversOf(deps: NotifierDeps, groupId: string, excludeUserId: number): Promise<number[]> {
  const members = await deps.groupRepo.membersOf(groupId);
  return members
    .filter((m) => ['owner', 'admin', 'approver'].includes(m.role) && m.userId !== excludeUserId)
    .map((m) => m.userId);
}

/** invite.created → the invited email (in-app too when it maps to a user). */
export async function onInviteCreated(deps: NotifierDeps, invite: Invite): Promise<void> {
  const group = await deps.groupRepo.group(invite.groupId);
  const ctx: RenderContext = { actorName: nameOf(invite.invitedBy), groupName: group?.name };
  const userId = await deps.groupRepo.userIdByEmail(invite.email);
  await emitTo(deps, { userId, email: invite.email }, 'invite.created', invite.id, ctx);
}

/** invite.accepted → the inviter + group admins/owner. */
export async function onInviteAccepted(deps: NotifierDeps, invite: Invite, actorUserId: number): Promise<void> {
  const group = await deps.groupRepo.group(invite.groupId);
  const ctx: RenderContext = { actorName: nameOf(actorUserId), groupName: group?.name };
  const admins = await approversOf(deps, invite.groupId, actorUserId);
  const recipients = new Set<number>([invite.invitedBy, ...admins]);
  recipients.delete(actorUserId);
  for (const userId of recipients) {
    await emitTo(deps, { userId, email: emailOf(userId) }, 'invite.accepted', invite.id, ctx);
  }
}

/** invite.declined → the inviter. */
export async function onInviteDeclined(deps: NotifierDeps, invite: Invite): Promise<void> {
  const group = await deps.groupRepo.group(invite.groupId);
  const ctx: RenderContext = { actorName: invite.email, groupName: group?.name };
  await emitTo(deps, { userId: invite.invitedBy, email: emailOf(invite.invitedBy) }, 'invite.declined', invite.id, ctx);
}

/** invite.revoked → the invited email. */
export async function onInviteRevoked(deps: NotifierDeps, invite: Invite): Promise<void> {
  const group = await deps.groupRepo.group(invite.groupId);
  const ctx: RenderContext = { groupName: group?.name };
  const userId = await deps.groupRepo.userIdByEmail(invite.email);
  await emitTo(deps, { userId, email: invite.email }, 'invite.revoked', invite.id, ctx);
}

/** leave.requested → approvers of the group (never the requester). */
export async function onLeaveRequested(deps: NotifierDeps, req: LeaveRequestRecord): Promise<void> {
  const group = await deps.groupRepo.group(req.groupId);
  const ctx: RenderContext = { actorName: nameOf(req.userId), groupName: group?.name, start: req.start, end: req.end };
  for (const userId of await approversOf(deps, req.groupId, req.userId)) {
    await emitTo(deps, { userId, email: emailOf(userId) }, 'leave.requested', req.id, ctx);
  }
}

/** leave.approved/rejected → the requester, with reason. */
export async function onLeaveDecided(deps: NotifierDeps, req: LeaveRequestRecord): Promise<void> {
  if (req.state !== 'approved' && req.state !== 'rejected') return;
  const group = await deps.groupRepo.group(req.groupId);
  const ctx: RenderContext = { groupName: group?.name, start: req.start, end: req.end, reason: req.reason };
  const type: NotificationType = req.state === 'approved' ? 'leave.approved' : 'leave.rejected';
  await emitTo(deps, { userId: req.userId, email: emailOf(req.userId) }, type, req.id, ctx);
}

/** plan.shared → the target member, or members of the target group. */
export async function onPlanShared(deps: NotifierDeps, share: PlanShareRecord): Promise<void> {
  const ctx: RenderContext = { actorName: nameOf(share.ownerUserId), planTitle: share.planId };
  const recipients = new Set<number>();
  if (share.userId !== undefined) recipients.add(share.userId);
  if (share.groupId) {
    for (const m of await deps.groupRepo.membersOf(share.groupId)) recipients.add(m.userId);
  }
  recipients.delete(share.ownerUserId);
  for (const userId of recipients) {
    await emitTo(deps, { userId, email: emailOf(userId) }, 'plan.shared', share.id, ctx);
  }
}
