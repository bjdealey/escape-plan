/**
 * Shared, pure authorization core for multi-user groups.
 *
 * This is the SINGLE SOURCE OF TRUTH for the permission matrix. It is enforced
 * in two places against different data stores:
 *   - the server service layer (`packages/server/src/access.ts`) over Postgres,
 *   - the web store (`apps/web/src/store/groups.tsx`) over seeded in-memory data.
 * The UI never decides access; it only reflects what these functions allow.
 *
 * Pure and deterministic — no I/O, no auth calls.
 */
import type { ISODate } from './dateutil.js';

export type GroupType = 'household' | 'team';
export type Role = 'owner' | 'admin' | 'approver' | 'member';
export type PrivacySetting = 'full' | 'busy' | 'private';
export type LeaveState = 'draft' | 'requested' | 'pending' | 'approved' | 'rejected';
export type ShareLevel = 'view' | 'coedit';
export type InviteStatus = 'pending' | 'accepted' | 'declined' | 'revoked' | 'expired';

export interface Group {
  id: string;
  name: string;
  type: GroupType;
}

export interface Membership {
  groupId: string;
  userId: number;
  role: Role;
}

export interface Invite {
  id: string;
  groupId: string;
  email: string;
  role: Role;
  token: string;
  status: InviteStatus;
  invitedBy: number;
  createdAt: string;
  expiresAt: string;
}

export interface LeaveHistoryEntry {
  state: LeaveState;
  at: string;
  by?: number;
  reason?: string;
}

export interface LeaveRequestRecord {
  id: string;
  groupId: string;
  userId: number;
  start: ISODate;
  end: ISODate;
  state: LeaveState;
  reason?: string;
  decidedBy?: number;
  decidedAt?: string;
  history: LeaveHistoryEntry[];
}

export interface PlanShareRecord {
  id: string;
  planId: string;
  ownerUserId: number;
  /** Shared with a whole group... */
  groupId?: string;
  /** ...or a specific member. */
  userId?: number;
  level: ShareLevel;
}

/** Higher rank ⇒ more authority. */
export const ROLE_RANK: Record<Role, number> = {
  member: 1,
  approver: 2,
  admin: 3,
  owner: 4,
};

export function roleAtLeast(role: Role, min: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

export class AuthorizationError extends Error {
  code = 'FORBIDDEN' as const;
  constructor(message = 'Forbidden') {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export type GroupAction =
  | 'group.view'
  | 'group.invite'
  | 'group.manageMembers'
  | 'group.delete'
  | 'leave.request'
  | 'leave.approve';

export interface AccessContext {
  groupType: GroupType;
  /** The actor's role in the group. `null` = not a member (deny by default). */
  actorRole: Role | null;
  /** For leave actions: is the actor the subject of the request? */
  isSelf?: boolean;
}

/**
 * The permission matrix. Deny by default: a non-member (`actorRole === null`)
 * can do nothing.
 */
export function can(action: GroupAction, ctx: AccessContext): boolean {
  const { groupType, actorRole, isSelf } = ctx;
  if (actorRole === null) return false; // not a member → denied

  switch (action) {
    case 'group.view':
      return true; // any member
    case 'group.invite':
      // Households are peer groups: any member can invite. Teams: admin+.
      return groupType === 'household' ? true : roleAtLeast(actorRole, 'admin');
    case 'group.manageMembers':
      return roleAtLeast(actorRole, 'admin');
    case 'group.delete':
      return roleAtLeast(actorRole, 'owner');
    case 'leave.request':
      return true; // any member may request their own leave
    case 'leave.approve':
      // Never approve your own request.
      if (isSelf) return false;
      // Teams need an approver+; households allow lightweight peer acknowledgement.
      return groupType === 'household' ? true : roleAtLeast(actorRole, 'approver');
    default:
      return false;
  }
}

export function assertCan(action: GroupAction, ctx: AccessContext): void {
  if (!can(action, ctx)) {
    throw new AuthorizationError(`Not permitted: ${action}`);
  }
}

/** Whether a household group auto-approves leave (no dedicated approver). */
export function isAutoApprove(groupType: GroupType): boolean {
  return groupType === 'household';
}

// --- Plan sharing -----------------------------------------------------------

export function canViewPlan(
  share: Pick<PlanShareRecord, 'ownerUserId' | 'groupId' | 'userId' | 'level'>,
  actor: { userId: number; groupIds: string[] },
): boolean {
  if (share.ownerUserId === actor.userId) return true;
  if (share.userId !== undefined && share.userId === actor.userId) return true;
  if (share.groupId !== undefined && actor.groupIds.includes(share.groupId)) return true;
  return false;
}

export function canEditPlan(
  share: Pick<PlanShareRecord, 'ownerUserId' | 'groupId' | 'userId' | 'level'>,
  actor: { userId: number; groupIds: string[] },
): boolean {
  if (share.ownerUserId === actor.userId) return true;
  if (share.level !== 'coedit') return false;
  return canViewPlan(share, actor);
}

// --- Privacy ----------------------------------------------------------------

/** What a viewer may see of another member's leave. */
export function leaveVisibility(
  privacy: PrivacySetting,
  viewerIsSelf: boolean,
): 'full' | 'busy' | 'hidden' {
  if (viewerIsSelf) return 'full';
  if (privacy === 'full') return 'full';
  if (privacy === 'busy') return 'busy';
  return 'hidden';
}

// --- Approval outlook (capacity-grounded, not a manufactured probability) ---

export interface ApprovalContext {
  /** Colleagues already off on the requested days. */
  overlapColleagues: number;
  /** Max colleagues allowed off simultaneously. */
  maxSimultaneous: number;
  /** Request falls (partly) in a blackout/busy period. */
  inBlackout: boolean;
}

/** Traffic-light band for an approval outlook. */
export type ApprovalLevel = 'clear' | 'open' | 'limited' | 'blocked';

export interface ApprovalOutlook {
  level: ApprovalLevel;
  /** One- or two-word status, e.g. 'Clear', 'At capacity'. */
  label: string;
  /**
   * Concrete reason grounded in the team's real constraints. Never a
   * manufactured probability — the inputs don't support a calibrated one.
   */
  detail: string;
  /** Free slots on the busiest overlapping day, counting this person's request. */
  slotsFree: number;
  /** The team's simultaneous-absence capacity. */
  capacity: number;
}

/**
 * Turn real group constraints into an honest, qualitative approval outlook.
 * Deterministic; no network, no stub — and deliberately not a percentage. The
 * available signals (blackout + remaining capacity) can't support a calibrated
 * probability, so we report the capacity facts instead of implying one.
 */
export function approvalOutlook(ctx: ApprovalContext): ApprovalOutlook {
  const capacity = Math.max(0, ctx.maxSimultaneous);
  const slotsFree = capacity - ctx.overlapColleagues;
  if (ctx.inBlackout) {
    return {
      level: 'blocked',
      label: 'Blackout',
      detail: 'These dates fall in a company blackout period.',
      slotsFree: Math.max(0, slotsFree),
      capacity,
    };
  }
  if (slotsFree <= 0) {
    return {
      level: 'limited',
      label: 'At capacity',
      detail: `Your team is already at its ${capacity}-person limit on at least one of these days.`,
      slotsFree: 0,
      capacity,
    };
  }
  if (ctx.overlapColleagues === 0) {
    return {
      level: 'clear',
      label: 'Clear',
      detail: 'No colleagues are booked off on these dates.',
      slotsFree,
      capacity,
    };
  }
  return {
    level: 'open',
    label: 'Space to book',
    detail: `${slotsFree} of ${capacity} team ${capacity === 1 ? 'slot' : 'slots'} free on the busiest day.`,
    slotsFree,
    capacity,
  };
}

/**
 * Legacy 0..1 capacity signal, retained only for the server's HR-integration
 * API contract. NOT a calibrated probability — the user-facing web UI uses
 * {@link approvalOutlook} and never presents this as a percentage.
 */
export function computeApprovalLikelihood(ctx: ApprovalContext): number {
  if (ctx.inBlackout) return 0.05;
  const remaining = ctx.maxSimultaneous - ctx.overlapColleagues;
  if (remaining <= 0) return 0.2;
  const ratio = Math.min(1, remaining / Math.max(1, ctx.maxSimultaneous));
  return Math.round(Math.min(0.98, 0.6 + 0.35 * ratio) * 100) / 100;
}

// --- Colleague-overlap helper (shared by engine + calendar) ----------------

export interface AbsenceRange {
  start: ISODate;
  end: ISODate;
}

/** Count how many colleague absences cover a given date. */
export function colleaguesOffOn(absences: AbsenceRange[], date: ISODate): number {
  let n = 0;
  for (const a of absences) if (date >= a.start && date <= a.end) n++;
  return n;
}

/** Invite tokens must be treated as opaque; this only validates shape. */
export function isValidInviteToken(token: unknown): token is string {
  return typeof token === 'string' && /^[a-f0-9]{32,64}$/.test(token);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Normalise + validate an invite email (untrusted input). */
export function normaliseEmail(email: unknown): string | null {
  if (typeof email !== 'string') return null;
  const trimmed = email.trim().toLowerCase();
  if (trimmed.length > 254 || !EMAIL_RE.test(trimmed)) return null;
  return trimmed;
}
