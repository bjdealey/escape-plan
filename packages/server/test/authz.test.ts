import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app.js';
import { MemoryRepository } from '../src/repository/memory.js';

// Act as a seeded user via the dev-only x-user-id header.
// Users: 1 Demo (g-house owner, g-team member), 2 Sam (g-house member),
//        3 Priya (g-team owner), 4 Marcus (g-team member), 5 Sofia (g-team approver).
let repo: MemoryRepository;
let app: Express;

beforeEach(() => {
  repo = new MemoryRepository();
  app = createApp({ repo });
});

const as = (id: number) => ({
  get: (url: string) => request(app).get(url).set('x-user-id', String(id)),
  post: (url: string) => request(app).post(url).set('x-user-id', String(id)),
  del: (url: string) => request(app).delete(url).set('x-user-id', String(id)),
});

describe('deny by default & cross-group isolation', () => {
  it('a non-member cannot read another group', async () => {
    const res = await as(2).get('/api/groups/g-team'); // Sam is not in g-team
    expect(res.status).toBe(403);
  });

  it('a non-member cannot write (invite) to another group', async () => {
    const res = await as(2).post('/api/groups/g-team/invites').send({ email: 'x@y.com' });
    expect(res.status).toBe(403);
  });

  it('an unknown group does not leak existence (403, not 404)', async () => {
    const res = await as(1).get('/api/groups/does-not-exist');
    expect(res.status).toBe(403);
  });

  it('a member only sees the groups they belong to', async () => {
    const res = await as(2).get('/api/groups');
    expect(res.status).toBe(200);
    const ids = res.body.groups.map((g: { group: { id: string } }) => g.group.id);
    expect(ids).toContain('g-house');
    expect(ids).not.toContain('g-team');
  });
});

describe('role checks', () => {
  it('a team member (non-admin) cannot invite', async () => {
    const res = await as(1).post('/api/groups/g-team/invites').send({ email: 'new@x.com' });
    expect(res.status).toBe(403);
  });

  it('a team owner can invite and gets an unguessable token', async () => {
    const res = await as(3).post('/api/groups/g-team/invites').send({ email: 'new@x.com' });
    expect(res.status).toBe(200);
    expect(res.body.token).toMatch(/^[a-f0-9]{48}$/);
  });

  it('a household member CAN invite (peer group)', async () => {
    const res = await as(2).post('/api/groups/g-house/invites').send({ email: 'friend@x.com' });
    expect(res.status).toBe(200);
  });

  it('a plain member cannot approve leave; an approver can; nobody approves their own', async () => {
    // lr-1 is Demo(1)'s own pending request in g-team.
    const memberTriesOwn = await as(1).post('/api/leave-requests/lr-1/decide').send({ decision: 'approved' });
    expect(memberTriesOwn.status).toBe(403); // self-approval denied

    const marcusTries = await as(4).post('/api/leave-requests/lr-1/decide').send({ decision: 'approved' });
    expect(marcusTries.status).toBe(403); // member, not approver

    const approver = await as(5).post('/api/leave-requests/lr-1/decide').send({ decision: 'approved' });
    expect(approver.status).toBe(200);
    expect(approver.body.state).toBe('approved');
    expect(approver.body.decidedBy).toBe(5);
  });
});

describe('household auto-approval', () => {
  it('a household leave request is auto-approved', async () => {
    const res = await as(2).post('/api/groups/g-house/leave-requests').send({
      start: '2026-09-01',
      end: '2026-09-04',
    });
    expect(res.status).toBe(200);
    expect(res.body.request.state).toBe('approved');
    expect(typeof res.body.approvalLikelihood).toBe('number');
  });
});

describe('invite lifecycle', () => {
  it('accept adds the accepting user as a member', async () => {
    const created = await as(3).post('/api/groups/g-team/invites').send({ email: 'sam@escape-plan.app' });
    const token = created.body.token as string;

    // Sam (2) is not yet in g-team.
    expect((await as(2).get('/api/groups/g-team')).status).toBe(403);

    const accept = await as(2).post('/api/invites/accept').send({ token });
    expect(accept.status).toBe(200);

    // Now Sam is a member.
    expect((await as(2).get('/api/groups/g-team')).status).toBe(200);
  });

  it('rejects an expired invite', async () => {
    await repo.createInvite({
      id: 'inv-expired',
      groupId: 'g-team',
      email: 'old@x.com',
      role: 'member',
      token: 'deadbeef'.repeat(4), // 32 hex
      status: 'pending',
      invitedBy: 3,
      createdAt: '2000-01-01T00:00:00.000Z',
      expiresAt: '2000-01-08T00:00:00.000Z', // definitively past, clock-independent
    });
    const res = await as(2).post('/api/invites/accept').send({ token: 'deadbeef'.repeat(4) });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/expired/i);
  });

  it('rejects a malformed token', async () => {
    const res = await as(2).post('/api/invites/accept').send({ token: 'not-a-token' });
    expect(res.status).toBe(400);
  });
});

describe('plan sharing authorization', () => {
  it('a group member can view/edit a coedit-shared plan', async () => {
    const res = await as(2).get('/api/plans/plan-1/access'); // sh-1 shares plan-1 to g-house coedit
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ canView: true, canEdit: true });
  });

  it('a non-member of the sharing group has no access', async () => {
    const res = await as(4).get('/api/plans/plan-1/access'); // Marcus is g-team only
    expect(res.body).toMatchObject({ canView: false, canEdit: false, level: 'none' });
  });

  it('sharing to a group requires membership in it', async () => {
    const denied = await as(2)
      .post('/api/plan-shares')
      .send({ planId: 'plan-9', groupId: 'g-team', level: 'view' }); // Sam not in g-team
    expect(denied.status).toBe(403);

    const ok = await as(1)
      .post('/api/plan-shares')
      .send({ planId: 'plan-9', groupId: 'g-team', level: 'view' }); // Demo is in g-team
    expect(ok.status).toBe(200);
  });

  it('only the plan owner can revoke a share', async () => {
    const res = await as(2).del('/api/plan-shares/sh-1'); // owned by user 1
    expect(res.status).toBe(403);
    const owner = await as(1).del('/api/plan-shares/sh-1');
    expect(owner.status).toBe(200);
  });
});
