import type { Channel, NotificationPreference, NotificationType } from '@escape-plan/engine';

export interface NotificationRecord {
  id: string;
  userId: number;
  type: NotificationType;
  title: string;
  body: string;
  link: string;
  createdAt: string;
  readAt?: string;
  dedupKey: string;
}

export type OutboxStatus = 'pending' | 'sent' | 'failed' | 'dead';

export interface OutboxItem {
  id: string;
  userId: number;
  email?: string;
  channel: Exclude<Channel, 'inapp'>;
  type: NotificationType;
  subject: string;
  body: string;
  link: string;
  status: OutboxStatus;
  attempts: number;
  nextAttemptAt: string;
  lastError?: string;
  dedupKey: string;
  createdAt: string;
  /** Single-use token backing the email List-Unsubscribe link. */
  unsubscribeToken?: string;
}

export interface PushSubscriptionRecord {
  userId: number;
  endpoint: string;
  /**
   * RFC 8291 payload-encryption keys from the browser PushSubscription. Both are
   * required to deliver a real (non-mock) web push; a subscription missing them
   * is retained but skipped by the live channel.
   */
  p256dh?: string;
  auth?: string;
  createdAt: string;
}

export interface UnsubTokenRecord {
  token: string;
  userId: number;
  type: NotificationType;
  expiresAt: string;
}

/**
 * Storage seam for notifications. Implemented in-memory (offline / cold start)
 * and over Postgres (persistence). All writes that could be retried are
 * idempotent by `dedupKey`.
 */
export interface NotificationStore {
  /** Returns false when a row with the same dedupKey already exists (idempotent). */
  addInApp(rec: NotificationRecord): Promise<boolean>;
  listInApp(userId: number): Promise<NotificationRecord[]>;
  markRead(userId: number, id: string): Promise<void>;
  markAllRead(userId: number): Promise<void>;
  unreadCount(userId: number): Promise<number>;

  /** Returns false when an outbox row with the same (dedupKey, channel) exists. */
  enqueueOutbox(item: OutboxItem): Promise<boolean>;
  dueOutbox(nowIso: string): Promise<OutboxItem[]>;
  updateOutbox(item: OutboxItem): Promise<void>;
  outboxByDedup(dedupKey: string, channel: OutboxItem['channel']): Promise<OutboxItem | undefined>;

  getPreference(userId: number): Promise<NotificationPreference | undefined>;
  setPreference(pref: NotificationPreference): Promise<void>;

  addPushSubscription(sub: PushSubscriptionRecord): Promise<void>;
  pushSubscriptions(userId: number): Promise<PushSubscriptionRecord[]>;

  createUnsubToken(rec: UnsubTokenRecord): Promise<void>;
  resolveUnsubToken(token: string): Promise<UnsubTokenRecord | undefined>;
}
