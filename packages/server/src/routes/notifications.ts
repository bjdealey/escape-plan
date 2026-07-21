import type { Express, Request, Response } from 'express';
import {
  type Channel,
  type NotificationPreference,
  type NotificationType,
  NOTIFICATION_CATALOG,
  emptyPreference,
} from '@escape-plan/engine';
import { getSession } from '../providers/auth.js';
import type { NotificationStore } from '../notifications/store.js';

const CHANNELS: Channel[] = ['inapp', 'email', 'push'];

function sanitizePreference(userId: number, body: unknown): NotificationPreference {
  const pref = emptyPreference(userId);
  if (typeof body !== 'object' || body === null) return pref;
  const b = body as Record<string, unknown>;
  pref.muted = b.muted === true;
  if (typeof b.quietHoursStart === 'number' && b.quietHoursStart >= 0 && b.quietHoursStart < 1440) {
    pref.quietHoursStart = Math.floor(b.quietHoursStart);
  }
  if (typeof b.quietHoursEnd === 'number' && b.quietHoursEnd >= 0 && b.quietHoursEnd < 1440) {
    pref.quietHoursEnd = Math.floor(b.quietHoursEnd);
  }
  const overrides = b.overrides;
  if (overrides && typeof overrides === 'object') {
    for (const [type, chans] of Object.entries(overrides as Record<string, unknown>)) {
      if (!(type in NOTIFICATION_CATALOG) || typeof chans !== 'object' || chans === null) continue;
      const clean: Partial<Record<Channel, boolean>> = {};
      for (const c of CHANNELS) {
        const v = (chans as Record<string, unknown>)[c];
        if (typeof v === 'boolean') clean[c] = v;
      }
      pref.overrides[type as NotificationType] = clean;
    }
  }
  return pref;
}

/** Notification centre, preferences, push subscribe, and public unsubscribe. */
export function mountNotificationRoutes(app: Express, store: NotificationStore): void {
  app.get('/api/notifications', async (req, res) => {
    const s = getSession(req);
    const [items, unread] = await Promise.all([store.listInApp(s.userId), store.unreadCount(s.userId)]);
    res.json({ items, unread });
  });

  app.post('/api/notifications/:id/read', async (req, res) => {
    const s = getSession(req);
    await store.markRead(s.userId, req.params.id);
    res.json({ ok: true });
  });

  app.post('/api/notifications/read-all', async (req, res) => {
    const s = getSession(req);
    await store.markAllRead(s.userId);
    res.json({ ok: true });
  });

  app.get('/api/notification-preferences', async (req, res) => {
    const s = getSession(req);
    res.json((await store.getPreference(s.userId)) ?? emptyPreference(s.userId));
  });

  app.put('/api/notification-preferences', async (req, res) => {
    const s = getSession(req);
    const pref = sanitizePreference(s.userId, req.body);
    await store.setPreference(pref);
    res.json(pref);
  });

  app.post('/api/push/subscribe', async (req, res) => {
    const s = getSession(req);
    const body = (req.body ?? {}) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
    const endpoint = body.endpoint;
    if (typeof endpoint !== 'string' || !/^https?:\/\//.test(endpoint)) {
      return res.status(400).json({ error: 'valid endpoint required' });
    }
    // Encryption keys are optional at the API (endpoint-only subscriptions are
    // still recorded), but real web push can only deliver when both are present.
    const p256dh = typeof body.keys?.p256dh === 'string' ? body.keys.p256dh : undefined;
    const auth = typeof body.keys?.auth === 'string' ? body.keys.auth : undefined;
    await store.addPushSubscription({
      userId: s.userId,
      endpoint,
      p256dh,
      auth,
      createdAt: new Date().toISOString(),
    });
    return res.json({ ok: true });
  });

  // Public: honoured immediately, no login. Token is unguessable + expiring.
  app.get('/api/unsubscribe', async (req: Request, res: Response) => {
    const token = String(req.query.token ?? '');
    const rec = await store.resolveUnsubToken(token);
    if (!rec || Date.parse(rec.expiresAt) < Date.now()) {
      return res.status(400).send('This unsubscribe link is invalid or has expired.');
    }
    const pref = (await store.getPreference(rec.userId)) ?? emptyPreference(rec.userId);
    pref.overrides[rec.type] = { ...pref.overrides[rec.type], email: false };
    await store.setPreference(pref);
    res.setHeader('Content-Type', 'text/html');
    return res.send(
      `<p>You have been unsubscribed from “${NOTIFICATION_CATALOG[rec.type].label}” emails. You’ll still see these in-app.</p>`,
    );
  });
}
