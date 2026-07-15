import type pg from 'pg';
import type {
  Group,
  Invite,
  InviteStatus,
  LeaveRequestRecord,
  Membership,
  PlanShareRecord,
  PrivacySetting,
  Role,
} from '@escape-plan/engine';
import type { GroupRepository } from '../access.js';

/**
 * Postgres-backed GroupRepository. The SAME authorization service runs over
 * this and the in-memory repo. All queries are parameterised (no string
 * interpolation of user input). Dates are cast to text to avoid tz drift.
 */
export class PgRepository implements GroupRepository {
  constructor(private pool: pg.Pool) {}

  async group(groupId: string): Promise<Group | undefined> {
    const { rows } = await this.pool.query(
      'SELECT id, name, type FROM groups WHERE id = $1',
      [groupId],
    );
    return rows[0] as Group | undefined;
  }

  async membership(groupId: string, userId: number): Promise<Membership | undefined> {
    const { rows } = await this.pool.query(
      'SELECT group_id AS "groupId", user_id AS "userId", role FROM group_members WHERE group_id = $1 AND user_id = $2',
      [groupId, userId],
    );
    return rows[0] as Membership | undefined;
  }

  async groupsForUser(userId: number): Promise<{ group: Group; role: Role }[]> {
    const { rows } = await this.pool.query(
      `SELECT g.id, g.name, g.type, gm.role
       FROM group_members gm JOIN groups g ON g.id = gm.group_id
       WHERE gm.user_id = $1 ORDER BY g.id`,
      [userId],
    );
    return rows.map((r) => ({
      group: { id: r.id, name: r.name, type: r.type },
      role: r.role,
    }));
  }

  async membersOf(groupId: string): Promise<Membership[]> {
    const { rows } = await this.pool.query(
      'SELECT group_id AS "groupId", user_id AS "userId", role FROM group_members WHERE group_id = $1 ORDER BY user_id',
      [groupId],
    );
    return rows as Membership[];
  }

  async addMembership(m: Membership): Promise<void> {
    await this.pool.query(
      `INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, $3)
       ON CONFLICT (group_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
      [m.groupId, m.userId, m.role],
    );
  }

  async removeMembership(groupId: string, userId: number): Promise<void> {
    await this.pool.query('DELETE FROM group_members WHERE group_id = $1 AND user_id = $2', [
      groupId,
      userId,
    ]);
  }

  async privacyFor(groupId: string, userId: number): Promise<PrivacySetting> {
    const { rows } = await this.pool.query(
      'SELECT setting FROM user_group_privacy WHERE group_id = $1 AND user_id = $2',
      [groupId, userId],
    );
    return (rows[0]?.setting as PrivacySetting) ?? 'full';
  }

  async setPrivacy(groupId: string, userId: number, setting: PrivacySetting): Promise<void> {
    await this.pool.query(
      `INSERT INTO user_group_privacy (group_id, user_id, setting) VALUES ($1, $2, $3)
       ON CONFLICT (group_id, user_id) DO UPDATE SET setting = EXCLUDED.setting`,
      [groupId, userId, setting],
    );
  }

  private inviteRow(r: Record<string, unknown>): Invite {
    return {
      id: r.id as string,
      groupId: r.groupId as string,
      email: r.email as string,
      role: r.role as Role,
      token: r.token as string,
      status: r.status as InviteStatus,
      invitedBy: r.invitedBy as number,
      createdAt: r.createdAt as string,
      expiresAt: r.expiresAt as string,
    };
  }

  async invitesForGroup(groupId: string): Promise<Invite[]> {
    const { rows } = await this.pool.query(
      `SELECT id, group_id AS "groupId", email, role, token, status,
              invited_by AS "invitedBy",
              to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
              to_char(expires_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "expiresAt"
       FROM group_invites WHERE group_id = $1 ORDER BY created_at DESC`,
      [groupId],
    );
    return rows.map((r) => this.inviteRow(r));
  }

  async inviteByToken(token: string): Promise<Invite | undefined> {
    const { rows } = await this.pool.query(
      `SELECT id, group_id AS "groupId", email, role, token, status,
              invited_by AS "invitedBy",
              to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
              to_char(expires_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "expiresAt"
       FROM group_invites WHERE token = $1`,
      [token],
    );
    return rows[0] ? this.inviteRow(rows[0]) : undefined;
  }

  async createInvite(i: Invite): Promise<void> {
    await this.pool.query(
      `INSERT INTO group_invites (id, group_id, email, role, token, status, invited_by, created_at, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [i.id, i.groupId, i.email, i.role, i.token, i.status, i.invitedBy, i.createdAt, i.expiresAt],
    );
  }

  async setInviteStatus(id: string, status: InviteStatus): Promise<void> {
    await this.pool.query('UPDATE group_invites SET status = $2 WHERE id = $1', [id, status]);
  }

  private requestRow(r: Record<string, unknown>): LeaveRequestRecord {
    return {
      id: r.id as string,
      groupId: r.groupId as string,
      userId: r.userId as number,
      start: r.start as string,
      end: r.end as string,
      state: r.state as LeaveRequestRecord['state'],
      reason: (r.reason as string) ?? undefined,
      decidedBy: (r.decidedBy as number) ?? undefined,
      decidedAt: (r.decidedAt as string) ?? undefined,
      history: (r.history as LeaveRequestRecord['history']) ?? [],
    };
  }

  private requestSelect(where: string): string {
    return `SELECT id, group_id AS "groupId", user_id AS "userId",
              to_char(start_date, 'YYYY-MM-DD') AS "start",
              to_char(end_date, 'YYYY-MM-DD') AS "end",
              state, reason, decided_by AS "decidedBy",
              to_char(decided_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "decidedAt",
              history
       FROM leave_requests ${where}`;
  }

  async leaveRequest(id: string): Promise<LeaveRequestRecord | undefined> {
    const { rows } = await this.pool.query(this.requestSelect('WHERE id = $1'), [id]);
    return rows[0] ? this.requestRow(rows[0]) : undefined;
  }

  async leaveRequestsForGroup(groupId: string): Promise<LeaveRequestRecord[]> {
    const { rows } = await this.pool.query(
      this.requestSelect('WHERE group_id = $1 ORDER BY start_date'),
      [groupId],
    );
    return rows.map((r) => this.requestRow(r));
  }

  async saveLeaveRequest(r: LeaveRequestRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO leave_requests (id, group_id, user_id, start_date, end_date, state, reason, decided_by, decided_at, history)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (id) DO UPDATE SET
         state = EXCLUDED.state, reason = EXCLUDED.reason,
         decided_by = EXCLUDED.decided_by, decided_at = EXCLUDED.decided_at,
         history = EXCLUDED.history`,
      [
        r.id, r.groupId, r.userId, r.start, r.end, r.state,
        r.reason ?? null, r.decidedBy ?? null, r.decidedAt ?? null, JSON.stringify(r.history),
      ],
    );
  }

  private shareRow(r: Record<string, unknown>): PlanShareRecord {
    return {
      id: r.id as string,
      planId: r.planId as string,
      ownerUserId: r.ownerUserId as number,
      groupId: (r.groupId as string) ?? undefined,
      userId: (r.userId as number) ?? undefined,
      level: r.level as PlanShareRecord['level'],
    };
  }

  async sharesForPlan(planId: string): Promise<PlanShareRecord[]> {
    const { rows } = await this.pool.query(
      `SELECT id, plan_id AS "planId", owner_user_id AS "ownerUserId",
              group_id AS "groupId", target_user_id AS "userId", level
       FROM plan_shares WHERE plan_id = $1`,
      [planId],
    );
    return rows.map((r) => this.shareRow(r));
  }

  async shareById(id: string): Promise<PlanShareRecord | undefined> {
    const { rows } = await this.pool.query(
      `SELECT id, plan_id AS "planId", owner_user_id AS "ownerUserId",
              group_id AS "groupId", target_user_id AS "userId", level
       FROM plan_shares WHERE id = $1`,
      [id],
    );
    return rows[0] ? this.shareRow(rows[0]) : undefined;
  }

  async createShare(s: PlanShareRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO plan_shares (id, plan_id, owner_user_id, group_id, target_user_id, level)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [s.id, s.planId, s.ownerUserId, s.groupId ?? null, s.userId ?? null, s.level],
    );
  }

  async deleteShare(id: string): Promise<void> {
    await this.pool.query('DELETE FROM plan_shares WHERE id = $1', [id]);
  }

  async userIdByEmail(email: string): Promise<number | undefined> {
    const { rows } = await this.pool.query('SELECT id FROM users WHERE lower(email) = lower($1)', [
      email,
    ]);
    return rows[0]?.id as number | undefined;
  }
}
