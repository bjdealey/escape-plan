import {
  DEMO_GROUPS,
  DEMO_INVITES,
  DEMO_LEAVE_REQUESTS,
  DEMO_MEMBERSHIPS,
  DEMO_PLAN_SHARES,
  DEMO_PRIVACY,
  DEMO_USERS,
  type Group,
  type Invite,
  type InviteStatus,
  type LeaveRequestRecord,
  type Membership,
  type PlanShareRecord,
  type PrivacySetting,
  type Role,
} from '@escape-plan/engine';
import type { GroupRepository } from '../access.js';

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/**
 * In-memory GroupRepository seeded from the shared fixtures. Deterministic and
 * dependency-free, so it powers offline authorization tests and the cold-start
 * server (no Postgres required). State is per-instance.
 */
export class MemoryRepository implements GroupRepository {
  private groups = clone(DEMO_GROUPS);
  private memberships = clone(DEMO_MEMBERSHIPS);
  private invites = clone(DEMO_INVITES);
  private requests = clone(DEMO_LEAVE_REQUESTS);
  private shares = clone(DEMO_PLAN_SHARES);
  private privacy = clone(DEMO_PRIVACY);
  private users = clone(DEMO_USERS);

  async group(groupId: string): Promise<Group | undefined> {
    return this.groups.find((g) => g.id === groupId);
  }
  async membership(groupId: string, userId: number): Promise<Membership | undefined> {
    return this.memberships.find((m) => m.groupId === groupId && m.userId === userId);
  }
  async groupsForUser(userId: number): Promise<{ group: Group; role: Role }[]> {
    return this.memberships
      .filter((m) => m.userId === userId)
      .map((m) => ({ group: this.groups.find((g) => g.id === m.groupId)!, role: m.role }))
      .filter((x) => x.group);
  }
  async membersOf(groupId: string): Promise<Membership[]> {
    return this.memberships.filter((m) => m.groupId === groupId);
  }
  async addMembership(m: Membership): Promise<void> {
    const existing = this.memberships.find((x) => x.groupId === m.groupId && x.userId === m.userId);
    if (existing) existing.role = m.role;
    else this.memberships.push(m);
  }
  async removeMembership(groupId: string, userId: number): Promise<void> {
    this.memberships = this.memberships.filter(
      (m) => !(m.groupId === groupId && m.userId === userId),
    );
  }
  async privacyFor(groupId: string, userId: number): Promise<PrivacySetting> {
    return this.privacy.find((p) => p.groupId === groupId && p.userId === userId)?.setting ?? 'full';
  }
  async setPrivacy(groupId: string, userId: number, setting: PrivacySetting): Promise<void> {
    const existing = this.privacy.find((p) => p.groupId === groupId && p.userId === userId);
    if (existing) existing.setting = setting;
    else this.privacy.push({ groupId, userId, setting });
  }

  async invitesForGroup(groupId: string): Promise<Invite[]> {
    return this.invites.filter((i) => i.groupId === groupId);
  }
  async inviteByToken(token: string): Promise<Invite | undefined> {
    return this.invites.find((i) => i.token === token);
  }
  async createInvite(invite: Invite): Promise<void> {
    this.invites.push(invite);
  }
  async setInviteStatus(id: string, status: InviteStatus): Promise<void> {
    const inv = this.invites.find((i) => i.id === id);
    if (inv) inv.status = status;
  }

  async leaveRequest(id: string): Promise<LeaveRequestRecord | undefined> {
    return this.requests.find((r) => r.id === id);
  }
  async leaveRequestsForGroup(groupId: string): Promise<LeaveRequestRecord[]> {
    return this.requests.filter((r) => r.groupId === groupId);
  }
  async saveLeaveRequest(r: LeaveRequestRecord): Promise<void> {
    const idx = this.requests.findIndex((x) => x.id === r.id);
    if (idx >= 0) this.requests[idx] = r;
    else this.requests.push(r);
  }

  async sharesForPlan(planId: string): Promise<PlanShareRecord[]> {
    return this.shares.filter((s) => s.planId === planId);
  }
  async shareById(id: string): Promise<PlanShareRecord | undefined> {
    return this.shares.find((s) => s.id === id);
  }
  async createShare(share: PlanShareRecord): Promise<void> {
    this.shares.push(share);
  }
  async deleteShare(id: string): Promise<void> {
    this.shares = this.shares.filter((s) => s.id !== id);
  }

  async userIdByEmail(email: string): Promise<number | undefined> {
    return this.users.find((u) => u.email.toLowerCase() === email.toLowerCase())?.id;
  }
}
