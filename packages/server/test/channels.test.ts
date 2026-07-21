import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Stub the web-push library so WebPushChannel is exercised against its documented
// contract (setVapidDetails + sendNotification) with no real network or keys.
const webpushMock = vi.hoisted(() => ({
  setVapidDetails: vi.fn(),
  sendNotification: vi.fn(async () => ({ statusCode: 201 })),
}));
vi.mock('web-push', () => ({ default: webpushMock }));

import {
  MockPushChannel,
  ResendEmailChannel,
  WebPushChannel,
  channelStatus,
  resolveChannels,
  type PushMessage,
} from '../src/notifications/channels.js';

function fakeResponse(ok = true, status = 200) {
  return { ok, status, json: async () => ({ id: 'e1' }) } as Response;
}

const VAPID_KEYS = ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'] as const;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  for (const k of ['RESEND_API_KEY', 'NOTIFY_EMAIL_FROM', ...VAPID_KEYS]) delete process.env[k];
});

function pushMsg(overrides: Partial<PushMessage> = {}): PushMessage {
  return {
    userId: 1,
    subscriptions: [
      { endpoint: 'https://push.example/abc', keys: { p256dh: 'p', auth: 'a' } },
    ],
    title: 'Leave approved',
    body: 'Your request was approved',
    link: '/plans',
    ...overrides,
  };
}

describe('WebPushChannel (VAPID / RFC 8291 contract)', () => {
  beforeEach(() => {
    webpushMock.sendNotification.mockResolvedValue({ statusCode: 201 });
  });

  it('configures VAPID once and encrypts a JSON payload per subscription', async () => {
    const channel = new WebPushChannel('pub', 'priv', 'mailto:x@y.z');
    expect(webpushMock.setVapidDetails).toHaveBeenCalledWith('mailto:x@y.z', 'pub', 'priv');

    await channel.send(
      pushMsg({
        subscriptions: [
          { endpoint: 'https://push.example/one', keys: { p256dh: 'p1', auth: 'a1' } },
          { endpoint: 'https://push.example/two', keys: { p256dh: 'p2', auth: 'a2' } },
        ],
      }),
    );

    expect(webpushMock.sendNotification).toHaveBeenCalledTimes(2);
    const [sub, payload] = webpushMock.sendNotification.mock.calls[0];
    expect(sub).toEqual({ endpoint: 'https://push.example/one', keys: { p256dh: 'p1', auth: 'a1' } });
    expect(JSON.parse(payload as string)).toEqual({
      title: 'Leave approved',
      body: 'Your request was approved',
      link: '/plans',
    });
  });

  it('skips subscriptions missing encryption keys (cannot be encrypted)', async () => {
    const channel = new WebPushChannel('pub', 'priv', 'mailto:x@y.z');
    await channel.send(
      pushMsg({
        subscriptions: [
          { endpoint: 'https://push.example/keyless' }, // no keys
          { endpoint: 'https://push.example/ok', keys: { p256dh: 'p', auth: 'a' } },
        ],
      }),
    );
    expect(webpushMock.sendNotification).toHaveBeenCalledTimes(1);
    expect(webpushMock.sendNotification.mock.calls[0][0]).toMatchObject({
      endpoint: 'https://push.example/ok',
    });
  });

  it('is a no-op (no throw) when there is nothing deliverable', async () => {
    const channel = new WebPushChannel('pub', 'priv', 'mailto:x@y.z');
    await expect(
      channel.send(pushMsg({ subscriptions: [{ endpoint: 'https://push.example/keyless' }] })),
    ).resolves.toBeUndefined();
    expect(webpushMock.sendNotification).not.toHaveBeenCalled();
  });

  it('accepts a partial success', async () => {
    webpushMock.sendNotification
      .mockRejectedValueOnce(new Error('410 Gone'))
      .mockResolvedValueOnce({ statusCode: 201 });
    const channel = new WebPushChannel('pub', 'priv', 'mailto:x@y.z');
    await expect(
      channel.send(
        pushMsg({
          subscriptions: [
            { endpoint: 'https://push.example/dead', keys: { p256dh: 'p', auth: 'a' } },
            { endpoint: 'https://push.example/live', keys: { p256dh: 'p', auth: 'a' } },
          ],
        }),
      ),
    ).resolves.toBeUndefined();
  });

  it('throws when every deliverable subscription fails (so the outbox retries)', async () => {
    webpushMock.sendNotification.mockRejectedValue(new Error('500 push service down'));
    const channel = new WebPushChannel('pub', 'priv', 'mailto:x@y.z');
    await expect(channel.send(pushMsg())).rejects.toThrow(/web push failed/i);
  });
});

describe('ResendEmailChannel (documented contract)', () => {
  it('POSTs to Resend with auth, one-click List-Unsubscribe headers, and HTML body', async () => {
    const fetchMock = vi.fn(async () => fakeResponse(true));
    vi.stubGlobal('fetch', fetchMock);

    await new ResendEmailChannel('re_key', 'Escape Plan <notify@x.app>', 'http://app').send({
      to: 'user@example.com',
      subject: 'Invite',
      body: 'You were invited',
      link: '/groups',
      unsubscribeUrl: 'http://api/unsub?token=t',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect((init as RequestInit).method).toBe('POST');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer re_key');
    const payload = JSON.parse((init as RequestInit).body as string);
    expect(payload.from).toBe('Escape Plan <notify@x.app>');
    expect(payload.to).toEqual(['user@example.com']);
    expect(payload.headers['List-Unsubscribe']).toBe('<http://api/unsub?token=t>');
    expect(payload.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(payload.html).toContain('You were invited');
  });

  it('throws on a non-2xx response so the outbox retries', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => fakeResponse(false, 422)));
    await expect(
      new ResendEmailChannel('re_key', 'from', 'http://app').send({
        to: 'user@example.com',
        subject: 'x',
        body: 'y',
        link: '/z',
      }),
    ).rejects.toThrow(/Resend HTTP 422/);
  });

  it('escapes HTML in the body (no markup injection)', async () => {
    const fetchMock = vi.fn(async () => fakeResponse(true));
    vi.stubGlobal('fetch', fetchMock);
    await new ResendEmailChannel('k', 'from', 'http://app').send({
      to: 'u@e.com',
      subject: 's',
      body: '<script>alert(1)</script>',
      link: '/l',
    });
    const payload = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(payload.html).not.toContain('<script>');
    expect(payload.html).toContain('&lt;script&gt;');
  });
});

describe('channel resolution + status honesty', () => {
  it('defaults both channels to mock with no keys', () => {
    const { email, push } = resolveChannels();
    expect(email).toBeInstanceOf(Object);
    expect(push).toBeInstanceOf(MockPushChannel);
    expect(channelStatus()).toEqual({ email: 'mock', push: 'mock' });
  });

  it('wires the real WebPushChannel exactly when status reports push live', () => {
    process.env.VAPID_PUBLIC_KEY = 'pub';
    process.env.VAPID_PRIVATE_KEY = 'priv';
    const { push } = resolveChannels();
    expect(push).toBeInstanceOf(WebPushChannel);
    expect(channelStatus().push).toBe('live');
  });

  it('stays mock (and status stays mock) when only one VAPID key is set', () => {
    process.env.VAPID_PUBLIC_KEY = 'pub'; // private missing
    expect(resolveChannels().push).toBeInstanceOf(MockPushChannel);
    expect(channelStatus().push).toBe('mock');
  });

  it('selects the live Resend email channel when a key is present', () => {
    process.env.RESEND_API_KEY = 're_key';
    expect(resolveChannels().email).toBeInstanceOf(ResendEmailChannel);
    expect(channelStatus().email).toBe('live');
  });
});
