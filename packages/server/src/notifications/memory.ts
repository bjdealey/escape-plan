import type { NotificationPreference } from '@escape-plan/engine';
import type {
  NotificationRecord,
  NotificationStore,
  OutboxItem,
  PushSubscriptionRecord,
  UnsubTokenRecord,
} from './store.js';

/** In-memory NotificationStore — offline tests + cold-start server. */
export class MemoryNotificationStore implements NotificationStore {
  private feed: NotificationRecord[] = [];
  private outbox: OutboxItem[] = [];
  private prefs = new Map<number, NotificationPreference>();
  private pushSubs: PushSubscriptionRecord[] = [];
  private unsub = new Map<string, UnsubTokenRecord>();

  async addInApp(rec: NotificationRecord): Promise<boolean> {
    if (this.feed.some((r) => r.dedupKey === rec.dedupKey)) return false;
    this.feed.push({ ...rec });
    return true;
  }
  async listInApp(userId: number): Promise<NotificationRecord[]> {
    return this.feed
      .filter((r) => r.userId === userId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }
  async markRead(userId: number, id: string): Promise<void> {
    const r = this.feed.find((x) => x.id === id && x.userId === userId);
    if (r && !r.readAt) r.readAt = new Date().toISOString();
  }
  async markAllRead(userId: number): Promise<void> {
    const ts = new Date().toISOString();
    for (const r of this.feed) if (r.userId === userId && !r.readAt) r.readAt = ts;
  }
  async unreadCount(userId: number): Promise<number> {
    return this.feed.filter((r) => r.userId === userId && !r.readAt).length;
  }

  async enqueueOutbox(item: OutboxItem): Promise<boolean> {
    if (this.outbox.some((o) => o.dedupKey === item.dedupKey && o.channel === item.channel)) {
      return false;
    }
    this.outbox.push({ ...item });
    return true;
  }
  async dueOutbox(nowIso: string): Promise<OutboxItem[]> {
    return this.outbox.filter((o) => o.status === 'pending' && o.nextAttemptAt <= nowIso);
  }
  async updateOutbox(item: OutboxItem): Promise<void> {
    const idx = this.outbox.findIndex((o) => o.id === item.id);
    if (idx >= 0) this.outbox[idx] = { ...item };
  }
  async outboxByDedup(dedupKey: string, channel: OutboxItem['channel']): Promise<OutboxItem | undefined> {
    return this.outbox.find((o) => o.dedupKey === dedupKey && o.channel === channel);
  }

  async getPreference(userId: number): Promise<NotificationPreference | undefined> {
    return this.prefs.get(userId);
  }
  async setPreference(pref: NotificationPreference): Promise<void> {
    this.prefs.set(pref.userId, JSON.parse(JSON.stringify(pref)));
  }

  async addPushSubscription(sub: PushSubscriptionRecord): Promise<void> {
    if (!this.pushSubs.some((s) => s.userId === sub.userId && s.endpoint === sub.endpoint)) {
      this.pushSubs.push({ ...sub });
    }
  }
  async pushSubscriptions(userId: number): Promise<PushSubscriptionRecord[]> {
    return this.pushSubs.filter((s) => s.userId === userId);
  }

  async createUnsubToken(rec: UnsubTokenRecord): Promise<void> {
    this.unsub.set(rec.token, { ...rec });
  }
  async resolveUnsubToken(token: string): Promise<UnsubTokenRecord | undefined> {
    return this.unsub.get(token);
  }
}
