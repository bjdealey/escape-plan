import type pg from 'pg';
import { type NotificationPreference, type NotificationType, emptyPreference } from '@escape-plan/engine';
import type {
  NotificationRecord,
  NotificationStore,
  OutboxItem,
  OutboxStatus,
  PushSubscriptionRecord,
  UnsubTokenRecord,
} from './store.js';

const TS = (col: string, as: string) =>
  `to_char(${col}, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "${as}"`;

/** Postgres-backed NotificationStore. Idempotent writes via unique dedup keys. */
export class PgNotificationStore implements NotificationStore {
  constructor(private pool: pg.Pool) {}

  async addInApp(rec: NotificationRecord): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `INSERT INTO notifications (id, user_id, type, title, body, link, created_at, dedup_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (dedup_key) DO NOTHING`,
      [rec.id, rec.userId, rec.type, rec.title, rec.body, rec.link, rec.createdAt, rec.dedupKey],
    );
    return (rowCount ?? 0) > 0;
  }

  async listInApp(userId: number): Promise<NotificationRecord[]> {
    const { rows } = await this.pool.query(
      `SELECT id, user_id AS "userId", type, title, body, link,
              ${TS('created_at', 'createdAt')}, ${TS('read_at', 'readAt')}, dedup_key AS "dedupKey"
       FROM notifications WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId],
    );
    return rows.map((r) => ({ ...r, readAt: r.readAt ?? undefined })) as NotificationRecord[];
  }

  async markRead(userId: number, id: string): Promise<void> {
    await this.pool.query(
      'UPDATE notifications SET read_at = now() WHERE id = $1 AND user_id = $2 AND read_at IS NULL',
      [id, userId],
    );
  }
  async markAllRead(userId: number): Promise<void> {
    await this.pool.query('UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL', [userId]);
  }
  async unreadCount(userId: number): Promise<number> {
    const { rows } = await this.pool.query(
      'SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL',
      [userId],
    );
    return rows[0].n as number;
  }

  private outboxRow(r: Record<string, unknown>): OutboxItem {
    return {
      id: r.id as string,
      userId: r.userId as number,
      email: (r.email as string) ?? undefined,
      channel: r.channel as OutboxItem['channel'],
      type: r.type as NotificationType,
      subject: r.subject as string,
      body: r.body as string,
      link: r.link as string,
      status: r.status as OutboxStatus,
      attempts: r.attempts as number,
      nextAttemptAt: r.nextAttemptAt as string,
      lastError: (r.lastError as string) ?? undefined,
      dedupKey: r.dedupKey as string,
      createdAt: r.createdAt as string,
      unsubscribeToken: (r.unsubscribeToken as string) ?? undefined,
    };
  }

  private outboxSelect(where: string): string {
    return `SELECT id, user_id AS "userId", email, channel, type, subject, body, link, status,
              attempts, ${TS('next_attempt_at', 'nextAttemptAt')}, last_error AS "lastError",
              dedup_key AS "dedupKey", ${TS('created_at', 'createdAt')},
              unsubscribe_token AS "unsubscribeToken"
            FROM notification_outbox ${where}`;
  }

  async enqueueOutbox(item: OutboxItem): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `INSERT INTO notification_outbox
        (id, user_id, email, channel, type, subject, body, link, status, attempts, next_attempt_at, dedup_key, created_at, unsubscribe_token)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (dedup_key, channel) DO NOTHING`,
      [
        item.id, item.userId, item.email ?? null, item.channel, item.type, item.subject, item.body,
        item.link, item.status, item.attempts, item.nextAttemptAt, item.dedupKey, item.createdAt,
        item.unsubscribeToken ?? null,
      ],
    );
    return (rowCount ?? 0) > 0;
  }

  async dueOutbox(nowIso: string): Promise<OutboxItem[]> {
    const { rows } = await this.pool.query(
      this.outboxSelect(`WHERE status = 'pending' AND next_attempt_at <= $1 ORDER BY created_at`),
      [nowIso],
    );
    return rows.map((r) => this.outboxRow(r));
  }
  async updateOutbox(item: OutboxItem): Promise<void> {
    await this.pool.query(
      `UPDATE notification_outbox
       SET status = $2, attempts = $3, next_attempt_at = $4, last_error = $5 WHERE id = $1`,
      [item.id, item.status, item.attempts, item.nextAttemptAt, item.lastError ?? null],
    );
  }
  async outboxByDedup(dedupKey: string, channel: OutboxItem['channel']): Promise<OutboxItem | undefined> {
    const { rows } = await this.pool.query(this.outboxSelect('WHERE dedup_key = $1 AND channel = $2'), [dedupKey, channel]);
    return rows[0] ? this.outboxRow(rows[0]) : undefined;
  }

  async getPreference(userId: number): Promise<NotificationPreference | undefined> {
    const { rows } = await this.pool.query(
      'SELECT user_id AS "userId", muted, quiet_start AS "quietHoursStart", quiet_end AS "quietHoursEnd", overrides FROM notification_preferences WHERE user_id = $1',
      [userId],
    );
    if (!rows[0]) return undefined;
    const r = rows[0];
    return {
      userId: r.userId,
      muted: r.muted,
      quietHoursStart: r.quietHoursStart ?? undefined,
      quietHoursEnd: r.quietHoursEnd ?? undefined,
      overrides: r.overrides ?? {},
    };
  }
  async setPreference(pref: NotificationPreference): Promise<void> {
    await this.pool.query(
      `INSERT INTO notification_preferences (user_id, muted, quiet_start, quiet_end, overrides)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (user_id) DO UPDATE SET muted = EXCLUDED.muted, quiet_start = EXCLUDED.quiet_start,
         quiet_end = EXCLUDED.quiet_end, overrides = EXCLUDED.overrides`,
      [pref.userId, pref.muted, pref.quietHoursStart ?? null, pref.quietHoursEnd ?? null, JSON.stringify(pref.overrides)],
    );
  }

  async addPushSubscription(sub: PushSubscriptionRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, created_at) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (user_id, endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
      [sub.userId, sub.endpoint, sub.p256dh ?? null, sub.auth ?? null, sub.createdAt],
    );
  }
  async pushSubscriptions(userId: number): Promise<PushSubscriptionRecord[]> {
    const { rows } = await this.pool.query(
      `SELECT user_id AS "userId", endpoint, p256dh, auth, ${TS('created_at', 'createdAt')} FROM push_subscriptions WHERE user_id = $1`,
      [userId],
    );
    return rows.map((r) => ({
      ...r,
      p256dh: r.p256dh ?? undefined,
      auth: r.auth ?? undefined,
    })) as PushSubscriptionRecord[];
  }

  async createUnsubToken(rec: UnsubTokenRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO notification_unsub_tokens (token, user_id, type, expires_at) VALUES ($1,$2,$3,$4)
       ON CONFLICT (token) DO NOTHING`,
      [rec.token, rec.userId, rec.type, rec.expiresAt],
    );
  }
  async resolveUnsubToken(token: string): Promise<UnsubTokenRecord | undefined> {
    const { rows } = await this.pool.query(
      `SELECT token, user_id AS "userId", type, ${TS('expires_at', 'expiresAt')} FROM notification_unsub_tokens WHERE token = $1`,
      [token],
    );
    return rows[0] as UnsubTokenRecord | undefined;
  }
}
