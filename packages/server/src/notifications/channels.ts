import webpush from 'web-push';
import { escapeHtml } from '@escape-plan/engine';

export interface EmailMessage {
  to: string;
  subject: string;
  /** Plain-text body; the adapter escapes it into HTML. */
  body: string;
  link: string;
  unsubscribeUrl?: string;
}

/** A single browser push target: endpoint plus its RFC 8291 encryption keys. */
export interface PushSubscriptionInput {
  endpoint: string;
  keys?: { p256dh: string; auth: string };
}

export interface PushMessage {
  userId: number;
  subscriptions: PushSubscriptionInput[];
  title: string;
  body: string;
  link: string;
}

/** A channel throws on failure; the delivery worker turns that into a retry. */
export interface EmailChannel {
  readonly name: string;
  send(msg: EmailMessage): Promise<void>;
}
export interface PushChannel {
  readonly name: string;
  send(msg: PushMessage): Promise<void>;
}

function htmlBody(msg: EmailMessage, baseUrl: string): string {
  const safe = escapeHtml(msg.body).replace(/\n/g, '<br>');
  const url = `${baseUrl}#${escapeHtml(msg.link)}`;
  const unsub = msg.unsubscribeUrl
    ? `<hr><p style="font-size:12px;color:#666">You can <a href="${escapeHtml(msg.unsubscribeUrl)}">unsubscribe</a> from these emails.</p>`
    : '';
  return `<div>${safe}</div><p><a href="${url}">Open Escape Plan</a></p>${unsub}`;
}

/** Records every "sent" message (incl. rendered HTML); default when keyless. */
export class MockEmailChannel implements EmailChannel {
  readonly name = 'mock-email';
  readonly sent: (EmailMessage & { html: string })[] = [];
  constructor(private baseUrl = 'http://localhost:5173') {}
  async send(msg: EmailMessage): Promise<void> {
    // Render HTML so escaping is exercised; never actually delivers.
    this.sent.push({ ...msg, html: htmlBody(msg, this.baseUrl) });
  }
}

/** Always throws — used to prove non-blocking + retry/dead-letter behaviour. */
export class FailingEmailChannel implements EmailChannel {
  readonly name = 'failing-email';
  async send(): Promise<void> {
    throw new Error('email provider unavailable');
  }
}

/**
 * Real transactional email via Resend (https://resend.com/docs).
 * Contract: POST https://api.resend.com/emails
 *   { from, to:[..], subject, html, headers:{ 'List-Unsubscribe': '<url>' } }
 * Documented; NOT verified without a key — see ITERATION-NOTES.md.
 */
export class ResendEmailChannel implements EmailChannel {
  readonly name = 'resend';
  constructor(
    private apiKey: string,
    private from: string,
    private baseUrl: string,
  ) {}
  async send(msg: EmailMessage): Promise<void> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
    const emailHeaders: Record<string, string> = {};
    if (msg.unsubscribeUrl) {
      emailHeaders['List-Unsubscribe'] = `<${msg.unsubscribeUrl}>`;
      emailHeaders['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
    }
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        from: this.from,
        to: [msg.to],
        subject: msg.subject, // already CR/LF-stripped upstream
        html: htmlBody(msg, this.baseUrl),
        headers: emailHeaders,
      }),
    });
    if (!res.ok) throw new Error(`Resend HTTP ${res.status}`);
  }
}

/** Records push sends; default when no VAPID keys are configured. */
export class MockPushChannel implements PushChannel {
  readonly name = 'mock-push';
  readonly sent: PushMessage[] = [];
  async send(msg: PushMessage): Promise<void> {
    this.sent.push(msg);
  }
}

/**
 * Real Web Push (VAPID / RFC 8291) via the `web-push` library. Encrypts the
 * payload per subscription and POSTs to each browser push endpoint (FCM, Mozilla
 * autopush, WNS…). A subscription missing its p256dh/auth keys cannot be
 * encrypted and is skipped. The send throws only when EVERY deliverable
 * subscription fails, so the outbox retries; a partial success is accepted.
 */
export class WebPushChannel implements PushChannel {
  readonly name = 'web-push';
  constructor(publicKey: string, privateKey: string, subject: string) {
    // Configure VAPID once for this channel instance.
    webpush.setVapidDetails(subject, publicKey, privateKey);
  }
  async send(msg: PushMessage): Promise<void> {
    const targets = msg.subscriptions.filter((s) => s.keys?.p256dh && s.keys?.auth);
    if (targets.length === 0) return; // nothing encryptable — a no-op, not a failure
    const payload = JSON.stringify({ title: msg.title, body: msg.body, link: msg.link });
    const results = await Promise.allSettled(
      targets.map((s) =>
        webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys! }, payload),
      ),
    );
    const failures = results.filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected',
    );
    if (failures.length === targets.length) {
      const reason = (failures[0].reason as Error)?.message ?? 'unknown error';
      throw new Error(`web push failed for all ${targets.length} subscription(s): ${reason}`);
    }
  }
}

export interface Channels {
  email: EmailChannel;
  push: PushChannel;
}

/** Resolve channels from env; default to mocks so cold start works keyless. */
export function resolveChannels(baseUrl = process.env.APP_BASE_URL ?? 'http://localhost:5173'): Channels {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.NOTIFY_EMAIL_FROM ?? 'Escape Plan <notify@escape-plan.app>';
  const email: EmailChannel = key ? new ResendEmailChannel(key, from, baseUrl) : new MockEmailChannel(baseUrl);

  // Real web push activates when BOTH VAPID keys are present, otherwise mock.
  const vapidPublic = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT ?? 'mailto:notify@escape-plan.app';
  const push: PushChannel =
    vapidPublic && vapidPrivate
      ? new WebPushChannel(vapidPublic, vapidPrivate, vapidSubject)
      : new MockPushChannel();

  return { email, push };
}

export function channelStatus(): Record<string, 'live' | 'mock'> {
  return {
    email: process.env.RESEND_API_KEY ? 'live' : 'mock',
    // Live push requires BOTH VAPID keys — the same condition resolveChannels
    // uses to wire the real WebPushChannel, so status can never claim 'live'
    // while delivery is still the mock.
    push: process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY ? 'live' : 'mock',
  };
}
