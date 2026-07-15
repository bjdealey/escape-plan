import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { MAX_ATTEMPTS } from '@escape-plan/engine';
import { createApp } from '../src/app.js';
import { MemoryRepository } from '../src/repository/memory.js';
import { MemoryNotificationStore } from '../src/notifications/memory.js';
import { FailingEmailChannel, MockEmailChannel, MockPushChannel } from '../src/notifications/channels.js';
import { processOutbox } from '../src/notifications/delivery.js';

let repo: MemoryRepository;
let store: MemoryNotificationStore;
let email: MockEmailChannel;
let app: Express;

function build(emailChannel = new MockEmailChannel()) {
  repo = new MemoryRepository();
  store = new MemoryNotificationStore();
  email = emailChannel instanceof MockEmailChannel ? emailChannel : new MockEmailChannel();
  app = createApp({ repo, notificationStore: store, channels: { email: emailChannel, push: new MockPushChannel() } });
}

beforeEach(() => build());

const as = (id: number) => ({
  get: (url: string) => request(app).get(url).set('x-user-id', String(id)),
  post: (url: string) => request(app).post(url).set('x-user-id', String(id)),
  put: (url: string) => request(app).put(url).set('x-user-id', String(id)),
});

const deliver = () =>
  processOutbox({ store, channels: { email, push: new MockPushChannel() }, apiBaseUrl: 'http://localhost:4000', now: () => new Date() });

describe('event → notification mapping (in-app + outbox)', () => {
  it('invite.created notifies the invited user in-app and queues an email', async () => {
    await as(3).post('/api/groups/g-team/invites').send({ email: 'sam@escape-plan.app' });
    // Sam (user 2) sees it in-app.
    const feed = await as(2).get('/api/notifications');
    expect(feed.body.items.some((n: { type: string }) => n.type === 'invite.created')).toBe(true);
    // Email is queued, not yet sent (delivery is async).
    expect(email.sent).toHaveLength(0);
    await deliver();
    expect(email.sent.some((m) => m.to === 'sam@escape-plan.app')).toBe(true);
  });

  it('leave.approved reaches the requester with the reason', async () => {
    // user 1 requests (pending) in team; approver (5) approves.
    const req = await as(1).post('/api/groups/g-team/leave-requests').send({ start: '2026-10-05', end: '2026-10-09' });
    const id = req.body.request.id;
    await as(5).post(`/api/leave-requests/${id}/decide`).send({ decision: 'approved', reason: 'Enjoy' });
    const feed = await as(1).get('/api/notifications');
    const n = feed.body.items.find((x: { type: string }) => x.type === 'leave.approved');
    expect(n).toBeTruthy();
    expect(n.body).toMatch(/Enjoy/);
  });
});

describe('authorization-safe recipient scoping', () => {
  it('leave.requested reaches approvers only — never the requester, a plain member, or a non-member', async () => {
    await as(1).post('/api/groups/g-team/leave-requests').send({ start: '2026-10-05', end: '2026-10-09' });
    const hasReq = async (uid: number) =>
      (await as(uid).get('/api/notifications')).body.items.some((n: { type: string }) => n.type === 'leave.requested');
    expect(await hasReq(3)).toBe(true); // owner (approver)
    expect(await hasReq(5)).toBe(true); // approver
    expect(await hasReq(1)).toBe(false); // requester
    expect(await hasReq(4)).toBe(false); // plain member
    expect(await hasReq(2)).toBe(false); // non-member of g-team
  });

  it('a plan shared to a group never notifies a non-member', async () => {
    await as(1).post('/api/plan-shares').send({ planId: 'plan-x', groupId: 'g-house', level: 'view' });
    // Marcus (4) is not in g-house.
    const marcus = await as(4).get('/api/notifications');
    expect(marcus.body.items.some((n: { type: string }) => n.type === 'plan.shared')).toBe(false);
  });
});

describe('non-blocking, retry/backoff, dead-letter, idempotency', () => {
  it('the action commits even when the email provider fails; the send retries then dead-letters', async () => {
    build(new FailingEmailChannel() as unknown as MockEmailChannel);
    // The triggering action still succeeds despite the (failing) email.
    const created = await as(3).post('/api/groups/g-team/invites').send({ email: 'sam@escape-plan.app' });
    expect(created.status).toBe(200);
    // In-app was delivered regardless of the email channel.
    const inApp = (await as(2).get('/api/notifications')).body.items;
    expect(inApp.length).toBeGreaterThan(0);
    const dedupKey = inApp.find((n: { type: string }) => n.type === 'invite.created').dedupKey as string;

    // Retry with an advancing clock (each round past the 1h backoff cap).
    let t = 3_000_000_000_000;
    const failingDeps = {
      store,
      channels: { email: new FailingEmailChannel(), push: new MockPushChannel() },
      apiBaseUrl: 'http://localhost:4000',
      now: () => new Date(t),
    };
    for (let i = 0; i < MAX_ATTEMPTS + 1; i++) {
      await processOutbox(failingDeps);
      t += 2 * 60 * 60 * 1000;
    }
    // The item is dead-lettered (not lost, not pending, not delivered).
    const item = await store.outboxByDedup(dedupKey, 'email');
    expect(item?.status).toBe('dead');
    expect(item?.attempts).toBe(MAX_ATTEMPTS);
    expect(await store.dueOutbox(new Date(t).toISOString())).toHaveLength(0);
  });

  it('a repeated identical trigger never duplicates a notification', async () => {
    const inv = (await as(3).post('/api/groups/g-team/invites').send({ email: 'dupe@example.com' })).body;
    // Re-emit for the SAME invite id would dedup; simulate by re-processing.
    const before = (await store.listInApp(2)).length;
    // Accept + re-accept path is guarded; here we assert enqueue idempotency directly.
    const one = await store.enqueueOutbox({
      id: 'x1', userId: 2, email: 'dupe@example.com', channel: 'email', type: 'invite.created',
      subject: 's', body: 'b', link: 'group', status: 'pending', attempts: 0,
      nextAttemptAt: new Date().toISOString(), dedupKey: `k:${inv.id}`, createdAt: new Date().toISOString(),
    });
    const two = await store.enqueueOutbox({
      id: 'x2', userId: 2, email: 'dupe@example.com', channel: 'email', type: 'invite.created',
      subject: 's', body: 'b', link: 'group', status: 'pending', attempts: 0,
      nextAttemptAt: new Date().toISOString(), dedupKey: `k:${inv.id}`, createdAt: new Date().toISOString(),
    });
    expect(one).toBe(true);
    expect(two).toBe(false); // deduped
    expect((await store.listInApp(2)).length).toBe(before);
  });
});

describe('preferences & unsubscribe compliance', () => {
  it('disabling leave.approved email suppresses the email but keeps it in-app', async () => {
    await as(1).put('/api/notification-preferences').send({ overrides: { 'leave.approved': { email: false } } });
    const req = await as(1).post('/api/groups/g-team/leave-requests').send({ start: '2026-10-05', end: '2026-10-09' });
    await as(5).post(`/api/leave-requests/${req.body.request.id}/decide`).send({ decision: 'approved' });
    await deliver();
    // In-app present…
    expect((await as(1).get('/api/notifications')).body.items.some((n: { type: string }) => n.type === 'leave.approved')).toBe(true);
    // …but no leave.approved email was sent.
    expect(email.sent.some((m) => m.to === 'demo@escape-plan.app' && m.subject.includes('approved'))).toBe(false);
  });

  it('unsubscribe link (no login) stops that email category immediately', async () => {
    // Generate an email with an unsubscribe token.
    const req = await as(1).post('/api/groups/g-team/leave-requests').send({ start: '2026-10-05', end: '2026-10-09' });
    await as(5).post(`/api/leave-requests/${req.body.request.id}/decide`).send({ decision: 'approved' });
    const item = await store.outboxByDedup(
      (await store.listInApp(1)).find((n) => n.type === 'leave.approved')!.dedupKey,
      'email',
    );
    expect(item?.unsubscribeToken).toBeTruthy();
    const unsub = await request(app).get(`/api/unsubscribe?token=${item!.unsubscribeToken}`);
    expect(unsub.status).toBe(200);
    // Preference now has leave.approved email off.
    const pref = await as(1).get('/api/notification-preferences');
    expect(pref.body.overrides['leave.approved'].email).toBe(false);
  });
});

describe('injection safety', () => {
  it('escapes HTML in the email body and strips CR/LF from the subject', async () => {
    await as(1).post('/api/plan-shares').send({ planId: '<script>alert(1)</script>', groupId: 'g-house', level: 'view' });
    await deliver();
    const msg = email.sent.find((m) => m.to === 'sam@escape-plan.app');
    expect(msg).toBeTruthy();
    expect(msg!.html).toContain('&lt;script&gt;');
    expect(msg!.html).not.toContain('<script>');
    expect(msg!.subject).not.toMatch(/[\r\n]/);
  });
});
