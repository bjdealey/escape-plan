import { escapeHtml } from '@escape-plan/engine';

export interface EmailMessage {
  to: string;
  subject: string;
  /** Plain-text body; the adapter escapes it into HTML. */
  body: string;
  link: string;
  unsubscribeUrl?: string;
}

export interface PushMessage {
  userId: number;
  endpoints: string[];
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

export interface Channels {
  email: EmailChannel;
  push: PushChannel;
}

/** Resolve channels from env; default to mocks so cold start works keyless. */
export function resolveChannels(baseUrl = process.env.APP_BASE_URL ?? 'http://localhost:5173'): Channels {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.NOTIFY_EMAIL_FROM ?? 'Escape Plan <notify@escape-plan.app>';
  const email: EmailChannel = key ? new ResendEmailChannel(key, from, baseUrl) : new MockEmailChannel(baseUrl);
  // Real web push (VAPID/web-push) is a documented seam; not wired without keys.
  const push: PushChannel = new MockPushChannel();
  return { email, push };
}

export function channelStatus(): Record<string, 'live' | 'mock'> {
  return {
    email: process.env.RESEND_API_KEY ? 'live' : 'mock',
    push: process.env.VAPID_PRIVATE_KEY ? 'live' : 'mock',
  };
}
