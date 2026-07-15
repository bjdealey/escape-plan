import * as React from 'react';
import { useNotifications } from './notifications';
import {
  AuthorizationError,
  DEMO_GROUPS,
  DEMO_GROUP_MAX,
  DEMO_INVITES,
  DEMO_LEAVE_REQUESTS,
  DEMO_MEMBERSHIPS,
  DEMO_PLAN_SHARES,
  DEMO_PRIVACY,
  DEMO_USERS,
  type DemoUser,
  type Group,
  type Invite,
  type LeaveRequestRecord,
  type LeaveState,
  type Membership,
  type PlanShareRecord,
  type PrivacySetting,
  type Role,
  type ShareLevel,
  assertCan,
  can as canDo,
  canEditPlan,
  canViewPlan,
  colleaguesOffOn,
  computeApprovalLikelihood,
  normaliseEmail,
} from '@escape-plan/engine';

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

function genToken(): string {
  const bytes = new Uint8Array(24);
  (globalThis.crypto ?? ({} as Crypto)).getRandomValues?.(bytes);
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return hex.length >= 32 ? hex : hex.padEnd(48, '0');
}

const uid = (p: string) => `${p}-${genToken().slice(0, 8)}`;
const nowIso = () => new Date().toISOString();

interface State {
  currentUserId: number;
  memberships: Membership[];
  invites: Invite[];
  requests: LeaveRequestRecord[];
  shares: PlanShareRecord[];
  privacy: { userId: number; groupId: string; setting: PrivacySetting }[];
  selectedGroupId: string | null;
}

export interface GroupsContextValue {
  users: DemoUser[];
  currentUser: DemoUser;
  actAs: (userId: number) => void;

  groups: Group[];
  myGroups: { group: Group; role: Role }[];
  selectedGroupId: string | null;
  selectGroup: (id: string) => void;

  roleIn: (groupId: string) => Role | null;
  membersOf: (groupId: string) => (Membership & { name: string; privacy: PrivacySetting })[];
  can: (action: Parameters<typeof canDo>[0], groupId: string, isSelf?: boolean) => boolean;

  invitesFor: (groupId: string) => Invite[];
  invitationsForMe: Invite[];
  requestsFor: (groupId: string) => LeaveRequestRecord[];
  colleagueAbsences: (groupId: string) => { start: string; end: string }[];
  maxSimultaneous: (groupId: string) => number | undefined;
  approvalLikelihood: (groupId: string, start: string, end: string) => number;

  invite: (groupId: string, email: string, role?: Role) => void;
  acceptInvite: (token: string) => void;
  declineInvite: (token: string) => void;
  revokeInvite: (groupId: string, inviteId: string) => void;
  leaveGroup: (groupId: string) => void;

  requestLeave: (groupId: string, start: string, end: string, reason?: string) => void;
  decideLeave: (requestId: string, decision: 'approved' | 'rejected', reason?: string) => void;
  setPrivacy: (groupId: string, setting: PrivacySetting) => void;

  shares: PlanShareRecord[];
  planAccess: (planId: string) => { canView: boolean; canEdit: boolean; level: string };
  sharePlan: (planId: string, groupId: string, level: ShareLevel) => void;
  revokeShare: (shareId: string) => void;
}

const GroupsContext = React.createContext<GroupsContextValue | null>(null);
const INVITE_TTL = 7 * 24 * 60 * 60 * 1000;

export function GroupsProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<State>(() => ({
    currentUserId: 1,
    memberships: clone(DEMO_MEMBERSHIPS),
    invites: clone(DEMO_INVITES),
    requests: clone(DEMO_LEAVE_REQUESTS),
    shares: clone(DEMO_PLAN_SHARES),
    privacy: clone(DEMO_PRIVACY),
    selectedGroupId: 'g-team',
  }));
  const notifications = useNotifications();

  const value = React.useMemo<GroupsContextValue>(() => {
    const me = state.currentUserId;
    const groupById = (id: string) => DEMO_GROUPS.find((g) => g.id === id);
    const roleIn = (groupId: string): Role | null =>
      state.memberships.find((m) => m.groupId === groupId && m.userId === me)?.role ?? null;

    const nameOf = (id: number) => DEMO_USERS.find((u) => u.id === id)?.name ?? `User ${id}`;
    const membersOf = (groupId: string) => state.memberships.filter((m) => m.groupId === groupId);
    const approversOf = (groupId: string, exclude: number) =>
      membersOf(groupId)
        .filter((m) => ['owner', 'admin', 'approver'].includes(m.role) && m.userId !== exclude)
        .map((m) => m.userId);

    const requireRole = (groupId: string): { group: Group; role: Role } => {
      const group = groupById(groupId);
      const role = roleIn(groupId);
      if (!group || role === null) throw new AuthorizationError('Not a member of this group');
      return { group, role };
    };

    const can: GroupsContextValue['can'] = (action, groupId, isSelf) => {
      const group = groupById(groupId);
      const role = roleIn(groupId);
      if (!group) return false;
      return canDo(action, { groupType: group.type, actorRole: role, isSelf });
    };

    const colleagueAbsences = (groupId: string) =>
      state.requests
        .filter((r) => r.groupId === groupId && r.userId !== me && r.state === 'approved')
        .map((r) => ({ start: r.start, end: r.end }));

    const maxSimultaneous = (groupId: string) => DEMO_GROUP_MAX[groupId];

    return {
      users: DEMO_USERS,
      currentUser: DEMO_USERS.find((u) => u.id === me)!,
      actAs: (userId) => setState((s) => ({ ...s, currentUserId: userId })),

      groups: DEMO_GROUPS,
      myGroups: state.memberships
        .filter((m) => m.userId === me)
        .map((m) => ({ group: groupById(m.groupId)!, role: m.role }))
        .filter((x) => x.group),
      selectedGroupId: state.selectedGroupId,
      selectGroup: (id) => setState((s) => ({ ...s, selectedGroupId: id })),

      roleIn,
      membersOf: (groupId) =>
        state.memberships
          .filter((m) => m.groupId === groupId)
          .map((m) => ({
            ...m,
            name: DEMO_USERS.find((u) => u.id === m.userId)?.name ?? `User ${m.userId}`,
            privacy:
              state.privacy.find((p) => p.groupId === groupId && p.userId === m.userId)?.setting ??
              'full',
          })),
      can,

      invitesFor: (groupId) =>
        state.invites
          .filter((i) => i.groupId === groupId)
          .map((i) =>
            i.status === 'pending' && Date.parse(i.expiresAt) < Date.now()
              ? { ...i, status: 'expired' as const }
              : i,
          ),

      invitationsForMe: state.invites.filter(
        (i) =>
          i.status === 'pending' &&
          Date.parse(i.expiresAt) >= Date.now() &&
          i.email === DEMO_USERS.find((u) => u.id === me)?.email,
      ),

      requestsFor: (groupId) => {
        const group = groupById(groupId);
        const role = roleIn(groupId);
        if (!group || role === null) return [];
        const all = state.requests.filter((r) => r.groupId === groupId);
        const approver =
          group.type === 'household' || role === 'approver' || role === 'admin' || role === 'owner';
        return approver ? all : all.filter((r) => r.userId === me);
      },

      colleagueAbsences,
      maxSimultaneous,
      approvalLikelihood: (groupId, start, end) => {
        const abs = colleagueAbsences(groupId);
        let overlap = 0;
        for (let d = start; d <= end; d = addDay(d)) {
          overlap = Math.max(overlap, colleaguesOffOn(abs, d));
        }
        return computeApprovalLikelihood({
          overlapColleagues: overlap,
          maxSimultaneous: maxSimultaneous(groupId) ?? 2,
          inBlackout: false,
        });
      },

      invite: (groupId, email, role = 'member') => {
        const { group, role: myRole } = requireRole(groupId);
        assertCan('group.invite', { groupType: group.type, actorRole: myRole });
        const normalised = normaliseEmail(email);
        if (!normalised) throw new Error('Invalid email address');
        const invite: Invite = {
          id: uid('inv'),
          groupId,
          email: normalised,
          role,
          token: genToken(),
          status: 'pending',
          invitedBy: me,
          createdAt: nowIso(),
          expiresAt: new Date(Date.now() + INVITE_TTL).toISOString(),
        };
        setState((s) => ({ ...s, invites: [...s.invites, invite] }));
        // Notify the invited user (if they already have an account).
        const invitee = DEMO_USERS.find((u) => u.email === normalised);
        if (invitee) {
          notifications.emit([
            { recipientUserId: invitee.id, type: 'invite.created', subjectId: invite.id, ctx: { actorName: nameOf(me), groupName: group.name } },
          ]);
        }
      },

      acceptInvite: (token) => {
        const invite = state.invites.find((i) => i.token === token && i.status === 'pending');
        if (!invite) throw new Error('Invite not found');
        if (Date.parse(invite.expiresAt) < Date.now()) throw new Error('Invite has expired');
        setState((s) => ({
          ...s,
          memberships: [
            ...s.memberships.filter((m) => !(m.groupId === invite.groupId && m.userId === me)),
            { groupId: invite.groupId, userId: me, role: invite.role },
          ],
          invites: s.invites.map((i) => (i.id === invite.id ? { ...i, status: 'accepted' } : i)),
          selectedGroupId: invite.groupId,
        }));
        // Notify the inviter + group admins/owners.
        const group = groupById(invite.groupId);
        const recipients = new Set<number>([invite.invitedBy, ...approversOf(invite.groupId, me)]);
        recipients.delete(me);
        notifications.emit(
          [...recipients].map((userId) => ({
            recipientUserId: userId,
            type: 'invite.accepted' as const,
            subjectId: invite.id,
            ctx: { actorName: nameOf(me), groupName: group?.name },
          })),
        );
      },

      declineInvite: (token) =>
        setState((s) => ({
          ...s,
          invites: s.invites.map((i) => (i.token === token ? { ...i, status: 'declined' } : i)),
        })),

      revokeInvite: (groupId, inviteId) => {
        const { group, role } = requireRole(groupId);
        assertCan('group.invite', { groupType: group.type, actorRole: role });
        setState((s) => ({
          ...s,
          invites: s.invites.map((i) => (i.id === inviteId ? { ...i, status: 'revoked' } : i)),
        }));
      },

      leaveGroup: (groupId) => {
        requireRole(groupId);
        const owners = state.memberships.filter((m) => m.groupId === groupId && m.role === 'owner');
        const mine = state.memberships.find((m) => m.groupId === groupId && m.userId === me)!;
        if (mine.role === 'owner' && owners.length === 1) {
          throw new Error('The sole owner cannot leave; transfer ownership first');
        }
        setState((s) => ({
          ...s,
          memberships: s.memberships.filter((m) => !(m.groupId === groupId && m.userId === me)),
        }));
      },

      requestLeave: (groupId, start, end, reason) => {
        const { group, role } = requireRole(groupId);
        assertCan('leave.request', { groupType: group.type, actorRole: role });
        const auto = group.type === 'household';
        const state0: LeaveState = auto ? 'approved' : 'pending';
        const ts = nowIso();
        const record: LeaveRequestRecord = {
          id: uid('lr'),
          groupId,
          userId: me,
          start,
          end,
          state: state0,
          reason,
          decidedBy: auto ? me : undefined,
          decidedAt: auto ? ts : undefined,
          history: [
            { state: 'requested', at: ts, by: me, reason },
            { state: state0, at: ts, by: me },
          ],
        };
        setState((s) => ({ ...s, requests: [...s.requests, record] }));
        // Team requests notify approvers (never the requester).
        if (state0 === 'pending') {
          notifications.emit(
            approversOf(groupId, me).map((userId) => ({
              recipientUserId: userId,
              type: 'leave.requested' as const,
              subjectId: record.id,
              ctx: { actorName: nameOf(me), groupName: group.name, start, end },
            })),
          );
        }
      },

      decideLeave: (requestId, decision, reason) => {
        const req = state.requests.find((r) => r.id === requestId);
        if (!req) throw new Error('Request not found');
        const { group, role } = requireRole(req.groupId);
        assertCan('leave.approve', {
          groupType: group.type,
          actorRole: role,
          isSelf: req.userId === me,
        });
        const ts = nowIso();
        setState((s) => ({
          ...s,
          requests: s.requests.map((r) =>
            r.id === requestId
              ? {
                  ...r,
                  state: decision,
                  reason: reason ?? r.reason,
                  decidedBy: me,
                  decidedAt: ts,
                  history: [...r.history, { state: decision, at: ts, by: me, reason }],
                }
              : r,
          ),
        }));
        // Notify the requester of the decision.
        notifications.emit([
          {
            recipientUserId: req.userId,
            type: decision === 'approved' ? 'leave.approved' : 'leave.rejected',
            subjectId: req.id,
            ctx: { groupName: group.name, start: req.start, end: req.end, reason },
          },
        ]);
      },

      setPrivacy: (groupId, setting) => {
        requireRole(groupId);
        setState((s) => ({
          ...s,
          privacy: [
            ...s.privacy.filter((p) => !(p.groupId === groupId && p.userId === me)),
            { groupId, userId: me, setting },
          ],
        }));
      },

      shares: state.shares,
      planAccess: (planId) => {
        const planShares = state.shares.filter((sh) => sh.planId === planId);
        const groupIds = state.memberships.filter((m) => m.userId === me).map((m) => m.groupId);
        const actor = { userId: me, groupIds };
        const canEdit = planShares.some((sh) => canEditPlan(sh, actor));
        const canView = canEdit || planShares.some((sh) => canViewPlan(sh, actor));
        return { canView, canEdit, level: canEdit ? 'coedit' : canView ? 'view' : 'none' };
      },
      sharePlan: (planId, groupId, level) => {
        requireRole(groupId); // must be a member of the target group
        const share: PlanShareRecord = { id: uid('sh'), planId, ownerUserId: me, groupId, level };
        setState((s) => ({ ...s, shares: [...s.shares, share] }));
        // Notify group members (never the sharer).
        notifications.emit(
          membersOf(groupId)
            .map((m) => m.userId)
            .filter((userId) => userId !== me)
            .map((userId) => ({
              recipientUserId: userId,
              type: 'plan.shared' as const,
              subjectId: share.id,
              ctx: { actorName: nameOf(me), planTitle: planId },
            })),
        );
      },
      revokeShare: (shareId) => {
        const share = state.shares.find((sh) => sh.id === shareId);
        if (!share) throw new Error('Share not found');
        if (share.ownerUserId !== me) throw new AuthorizationError('Only the plan owner can revoke');
        setState((s) => ({ ...s, shares: s.shares.filter((sh) => sh.id !== shareId) }));
      },
    };
  }, [state, notifications]);

  return <GroupsContext.Provider value={value}>{children}</GroupsContext.Provider>;
}

function addDay(iso: string): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

export function useGroups(): GroupsContextValue {
  const ctx = React.useContext(GroupsContext);
  if (!ctx) throw new Error('useGroups must be used within GroupsProvider');
  return ctx;
}
