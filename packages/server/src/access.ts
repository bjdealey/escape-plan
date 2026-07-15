/**
 * Authorization service layer. Deny by default.
 *
 * Every group-scoped read/write goes through here. Enforcement uses the shared
 * pure permission matrix from `@escape-plan/engine` (single source of truth)
 * over a `GroupRepository` — so the SAME rules run against Postgres (prod) and
 * an in-memory store (offline tests / cold start). The HTTP layer only maps
 * `AuthorizationError` → 403 and validation errors → 400.
 */
import { randomBytes } from 'node:crypto';
import {
  AuthorizationError,
  type Group,
  type Invite,
  type InviteStatus,
  type LeaveRequestRecord,
  type LeaveState,
  type Membership,
  type PlanShareRecord,
  type PrivacySetting,
  type Role,
  type ShareLevel,
  assertCan,
  canEditPlan,
  canViewPlan,
  colleaguesOffOn,
  computeApprovalLikelihood,
  normaliseEmail,
} from '@escape-plan/engine';

export interface Session {
  userId: number;
  email: string;
}

export interface GroupRepository {
  group(groupId: string): Promise<Group | undefined>;
  membership(groupId: string, userId: number): Promise<Membership | undefined>;
  groupsForUser(userId: number): Promise<{ group: Group; role: Role }[]>;
  membersOf(groupId: string): Promise<Membership[]>;
  addMembership(m: Membership): Promise<void>;
  removeMembership(groupId: string, userId: number): Promise<void>;
  privacyFor(groupId: string, userId: number): Promise<PrivacySetting>;
  setPrivacy(groupId: string, userId: number, setting: PrivacySetting): Promise<void>;

  invitesForGroup(groupId: string): Promise<Invite[]>;
  inviteByToken(token: string): Promise<Invite | undefined>;
  createInvite(invite: Invite): Promise<void>;
  setInviteStatus(id: string, status: InviteStatus): Promise<void>;

  leaveRequest(id: string): Promise<LeaveRequestRecord | undefined>;
  leaveRequestsForGroup(groupId: string): Promise<LeaveRequestRecord[]>;
  saveLeaveRequest(r: LeaveRequestRecord): Promise<void>;

  sharesForPlan(planId: string): Promise<PlanShareRecord[]>;
  shareById(id: string): Promise<PlanShareRecord | undefined>;
  createShare(share: PlanShareRecord): Promise<void>;
  deleteShare(id: string): Promise<void>;

  userIdByEmail(email: string): Promise<number | undefined>;
}

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const now = () => new Date();

function genId(prefix: string): string {
  return `${prefix}-${randomBytes(6).toString('hex')}`;
}

/** Deny-by-default membership gate. Throws unless a membership (of min role) exists. */
export async function requireMembership(
  repo: GroupRepository,
  userId: number,
  groupId: string,
  minRole?: Role,
): Promise<Membership> {
  const m = await repo.membership(groupId, userId);
  if (!m) throw new AuthorizationError('Not a member of this group');
  if (minRole) {
    // roleAtLeast is baked into the matrix; re-check explicitly for management ops.
    const rank: Record<Role, number> = { member: 1, approver: 2, admin: 3, owner: 4 };
    if (rank[m.role] < rank[minRole]) {
      throw new AuthorizationError(`Requires role ${minRole}`);
    }
  }
  return m;
}

async function requireGroup(repo: GroupRepository, groupId: string): Promise<Group> {
  const g = await repo.group(groupId);
  if (!g) throw new AuthorizationError('Unknown group'); // don't leak existence
  return g;
}

// --- Groups -----------------------------------------------------------------

export async function listMyGroups(repo: GroupRepository, session: Session) {
  return repo.groupsForUser(session.userId);
}

export async function getGroupView(repo: GroupRepository, session: Session, groupId: string) {
  const me = await requireMembership(repo, session.userId, groupId);
  const group = await requireGroup(repo, groupId);
  const members = await repo.membersOf(groupId);
  return { group, myRole: me.role, members };
}

// --- Invites ----------------------------------------------------------------

export async function listInvites(repo: GroupRepository, session: Session, groupId: string) {
  await requireMembership(repo, session.userId, groupId);
  const all = await repo.invitesForGroup(groupId);
  return all.map(expireIfNeeded);
}

function expireIfNeeded(inv: Invite): Invite {
  if (inv.status === 'pending' && Date.parse(inv.expiresAt) < now().getTime()) {
    return { ...inv, status: 'expired' };
  }
  return inv;
}

export async function createInvite(
  repo: GroupRepository,
  session: Session,
  groupId: string,
  email: unknown,
  role: Role = 'member',
): Promise<Invite> {
  const me = await requireMembership(repo, session.userId, groupId);
  const group = await requireGroup(repo, groupId);
  assertCan('group.invite', { groupType: group.type, actorRole: me.role });

  const normalised = normaliseEmail(email);
  if (!normalised) throw new ValidationError('Invalid email address');
  if (!['owner', 'admin', 'approver', 'member'].includes(role)) {
    throw new ValidationError('Invalid role');
  }

  const invite: Invite = {
    id: genId('inv'),
    groupId,
    email: normalised,
    role,
    token: randomBytes(24).toString('hex'), // 48 hex chars, unguessable, single-use
    status: 'pending',
    invitedBy: session.userId,
    createdAt: now().toISOString(),
    expiresAt: new Date(now().getTime() + INVITE_TTL_MS).toISOString(),
  };
  await repo.createInvite(invite);
  return invite;
}

export async function acceptInvite(repo: GroupRepository, session: Session, token: unknown) {
  if (typeof token !== 'string' || !/^[a-f0-9]{32,64}$/.test(token)) {
    throw new ValidationError('Invalid invite token');
  }
  const invite = await repo.inviteByToken(token);
  if (!invite || invite.status !== 'pending') throw new ValidationError('Invite not found');
  if (Date.parse(invite.expiresAt) < now().getTime()) {
    await repo.setInviteStatus(invite.id, 'expired');
    throw new ValidationError('Invite has expired');
  }
  // Add the accepting user as a member with the invited role.
  await repo.addMembership({ groupId: invite.groupId, userId: session.userId, role: invite.role });
  await repo.setInviteStatus(invite.id, 'accepted');
  return { groupId: invite.groupId, role: invite.role };
}

export async function declineInvite(repo: GroupRepository, _session: Session, token: unknown) {
  if (typeof token !== 'string' || !/^[a-f0-9]{32,64}$/.test(token)) {
    throw new ValidationError('Invalid invite token');
  }
  const invite = await repo.inviteByToken(token);
  if (!invite || invite.status !== 'pending') throw new ValidationError('Invite not found');
  await repo.setInviteStatus(invite.id, 'declined');
}

export async function revokeInvite(
  repo: GroupRepository,
  session: Session,
  groupId: string,
  inviteId: string,
) {
  const me = await requireMembership(repo, session.userId, groupId);
  const group = await requireGroup(repo, groupId);
  assertCan('group.invite', { groupType: group.type, actorRole: me.role });
  const invites = await repo.invitesForGroup(groupId);
  const inv = invites.find((i) => i.id === inviteId);
  if (!inv) throw new ValidationError('Invite not found');
  await repo.setInviteStatus(inviteId, 'revoked');
}

export async function leaveGroup(repo: GroupRepository, session: Session, groupId: string) {
  await requireMembership(repo, session.userId, groupId);
  const members = await repo.membersOf(groupId);
  const owners = members.filter((m) => m.role === 'owner');
  const me = members.find((m) => m.userId === session.userId)!;
  if (me.role === 'owner' && owners.length === 1) {
    throw new ValidationError('The sole owner cannot leave; transfer ownership first');
  }
  await repo.removeMembership(groupId, session.userId);
}

// --- Leave requests + approval ---------------------------------------------

async function groupCapacityContext(
  repo: GroupRepository,
  groupId: string,
  userId: number,
  start: string,
  end: string,
) {
  const requests = await repo.leaveRequestsForGroup(groupId);
  const colleagueAbsences = requests
    .filter((r) => r.userId !== userId && r.state === 'approved')
    .map((r) => ({ start: r.start, end: r.end }));
  // Peak overlap across the requested range.
  let overlap = 0;
  for (let d = start; d <= end; d = addDay(d)) {
    overlap = Math.max(overlap, colleaguesOffOn(colleagueAbsences, d));
  }
  return { overlap, colleagueAbsences };
}

function addDay(iso: string): string {
  const ms = Date.parse(`${iso}T00:00:00Z`) + 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

export async function listLeaveRequests(repo: GroupRepository, session: Session, groupId: string) {
  const me = await requireMembership(repo, session.userId, groupId);
  const group = await requireGroup(repo, groupId);
  const all = await repo.leaveRequestsForGroup(groupId);
  const canApprove =
    group.type === 'household' || me.role === 'approver' || me.role === 'admin' || me.role === 'owner';
  // Requesters see their own; approvers additionally see the whole queue.
  return canApprove ? all : all.filter((r) => r.userId === session.userId);
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export async function createLeaveRequest(
  repo: GroupRepository,
  session: Session,
  groupId: string,
  input: { start: unknown; end: unknown; reason?: unknown },
) {
  const me = await requireMembership(repo, session.userId, groupId);
  const group = await requireGroup(repo, groupId);
  assertCan('leave.request', { groupType: group.type, actorRole: me.role });

  const { start, end } = input;
  if (typeof start !== 'string' || typeof end !== 'string' || !ISO.test(start) || !ISO.test(end) || start > end) {
    throw new ValidationError('start and end must be YYYY-MM-DD with start<=end');
  }
  const reason = typeof input.reason === 'string' ? input.reason.slice(0, 500) : undefined;

  const ts = now().toISOString();
  const autoApprove = group.type === 'household';
  const state: LeaveState = autoApprove ? 'approved' : 'pending';
  const record: LeaveRequestRecord = {
    id: genId('lr'),
    groupId,
    userId: session.userId,
    start,
    end,
    state,
    reason,
    decidedBy: autoApprove ? session.userId : undefined,
    decidedAt: autoApprove ? ts : undefined,
    history: [
      { state: 'requested', at: ts, by: session.userId, reason },
      { state, at: ts, by: session.userId },
    ],
  };
  await repo.saveLeaveRequest(record);

  const { overlap } = await groupCapacityContext(repo, groupId, session.userId, start, end);
  const likelihood = computeApprovalLikelihood({
    overlapColleagues: overlap,
    maxSimultaneous: 2,
    inBlackout: false,
  });
  return { request: record, approvalLikelihood: likelihood };
}

export async function decideLeaveRequest(
  repo: GroupRepository,
  session: Session,
  requestId: string,
  decision: 'approved' | 'rejected',
  reason?: unknown,
) {
  const req = await repo.leaveRequest(requestId);
  if (!req) throw new ValidationError('Request not found');
  const me = await requireMembership(repo, session.userId, req.groupId);
  const group = await requireGroup(repo, req.groupId);
  assertCan('leave.approve', {
    groupType: group.type,
    actorRole: me.role,
    isSelf: req.userId === session.userId,
  });
  if (decision !== 'approved' && decision !== 'rejected') {
    throw new ValidationError('decision must be approved or rejected');
  }
  const cleanReason = typeof reason === 'string' ? reason.slice(0, 500) : undefined;
  const ts = now().toISOString();
  const updated: LeaveRequestRecord = {
    ...req,
    state: decision,
    reason: cleanReason ?? req.reason,
    decidedBy: session.userId,
    decidedAt: ts,
    history: [...req.history, { state: decision, at: ts, by: session.userId, reason: cleanReason }],
  };
  await repo.saveLeaveRequest(updated);
  return updated;
}

// --- Plan sharing -----------------------------------------------------------

export async function createPlanShare(
  repo: GroupRepository,
  session: Session,
  input: { planId: unknown; groupId?: unknown; userId?: unknown; level?: unknown },
) {
  const { planId } = input;
  if (typeof planId !== 'string' || !planId) throw new ValidationError('planId required');
  const level: ShareLevel = input.level === 'coedit' ? 'coedit' : 'view';
  const groupId = typeof input.groupId === 'string' ? input.groupId : undefined;
  const userId = typeof input.userId === 'number' ? input.userId : undefined;
  if (!groupId && userId === undefined) throw new ValidationError('groupId or userId required');
  // Sharing to a group requires the sharer to be a member of it.
  if (groupId) await requireMembership(repo, session.userId, groupId);

  const share: PlanShareRecord = {
    id: genId('sh'),
    planId,
    ownerUserId: session.userId,
    groupId,
    userId,
    level,
  };
  await repo.createShare(share);
  return share;
}

export async function revokePlanShare(repo: GroupRepository, session: Session, shareId: string) {
  const share = await repo.shareById(shareId);
  if (!share) throw new ValidationError('Share not found');
  if (share.ownerUserId !== session.userId) {
    throw new AuthorizationError('Only the plan owner can revoke a share');
  }
  await repo.deleteShare(shareId);
}

/** Effective access level a user has to a plan (deny-by-default). */
export async function planAccess(repo: GroupRepository, session: Session, planId: string) {
  const shares = await repo.sharesForPlan(planId);
  const groups = (await repo.groupsForUser(session.userId)).map((g) => g.group.id);
  const actor = { userId: session.userId, groupIds: groups };
  const canEdit = shares.some((s) => canEditPlan(s, actor));
  const canView = canEdit || shares.some((s) => canViewPlan(s, actor));
  return { canView, canEdit, level: canEdit ? 'coedit' : canView ? 'view' : 'none' } as const;
}

export class ValidationError extends Error {
  code = 'BAD_REQUEST' as const;
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}
