import { MAX_ATTEMPTS, backoffMs } from '@escape-plan/engine';
import type { Channels } from './channels.js';
import type { NotificationStore } from './store.js';

export interface DeliveryDeps {
  store: NotificationStore;
  channels: Channels;
  /** API base for building unsubscribe links. */
  apiBaseUrl: string;
  now: () => Date;
}

export interface DeliveryResult {
  processed: number;
  sent: number;
  retried: number;
  dead: number;
}

/**
 * Deliver all due outbox items. Runs OUTSIDE the request path. Idempotent: an
 * item already `sent` is never picked up again; a repeated trigger is
 * de-duplicated at enqueue. Failures retry with exponential backoff and
 * dead-letter after MAX_ATTEMPTS — never lost, never duplicated.
 */
export async function processOutbox(deps: DeliveryDeps): Promise<DeliveryResult> {
  const now = deps.now();
  const items = await deps.store.dueOutbox(now.toISOString());
  const result: DeliveryResult = { processed: 0, sent: 0, retried: 0, dead: 0 };

  for (const item of items) {
    result.processed++;
    try {
      if (item.channel === 'email') {
        if (!item.email) throw new Error('missing recipient email');
        const unsubscribeUrl = item.unsubscribeToken
          ? `${deps.apiBaseUrl}/api/unsubscribe?token=${item.unsubscribeToken}`
          : undefined;
        await deps.channels.email.send({
          to: item.email,
          subject: item.subject,
          body: item.body,
          link: item.link,
          unsubscribeUrl,
        });
      } else {
        const subs = await deps.store.pushSubscriptions(item.userId);
        await deps.channels.push.send({
          userId: item.userId,
          endpoints: subs.map((s) => s.endpoint),
          title: item.subject,
          body: item.body,
          link: item.link,
        });
      }
      await deps.store.updateOutbox({ ...item, status: 'sent' });
      result.sent++;
    } catch (err) {
      const attempts = item.attempts + 1;
      if (attempts >= MAX_ATTEMPTS) {
        await deps.store.updateOutbox({
          ...item,
          attempts,
          status: 'dead',
          lastError: (err as Error).message,
        });
        result.dead++;
      } else {
        await deps.store.updateOutbox({
          ...item,
          attempts,
          status: 'pending',
          lastError: (err as Error).message,
          nextAttemptAt: new Date(now.getTime() + backoffMs(attempts)).toISOString(),
        });
        result.retried++;
      }
    }
  }
  return result;
}

/** Start a background interval worker. Returns a stop function. */
export function startOutboxWorker(deps: DeliveryDeps, intervalMs = 15_000): () => void {
  const timer = setInterval(() => {
    processOutbox(deps).catch((err) => console.error('outbox worker error:', err.message));
  }, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
