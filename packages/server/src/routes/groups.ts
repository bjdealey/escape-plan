import type { Express, Request, Response } from 'express';
import { AuthorizationError } from '@escape-plan/engine';
import { getSession } from '../providers/auth.js';
import {
  type GroupRepository,
  type Session,
  ValidationError,
  acceptInvite,
  createInvite,
  createLeaveRequest,
  createPlanShare,
  decideLeaveRequest,
  declineInvite,
  getGroupView,
  leaveGroup,
  listInvites,
  listLeaveRequests,
  listMyGroups,
  planAccess,
  revokeInvite,
  revokePlanShare,
} from '../access.js';
import {
  type NotifierDeps,
  onInviteAccepted,
  onInviteCreated,
  onInviteDeclined,
  onInviteRevoked,
  onLeaveDecided,
  onLeaveRequested,
  onPlanShared,
} from '../notifications/notifier.js';

/**
 * Fire a notifier emit without ever affecting the triggering action: the emit
 * only persists intent (in-app row + outbox rows); delivery runs in the worker.
 * Any error is swallowed so the action's response is unaffected.
 */
async function emitSafe(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    console.error('notification emit failed (non-blocking):', (err as Error).message);
  }
}

function mapError(err: unknown, res: Response): void {
  if (err instanceof AuthorizationError) {
    res.status(403).json({ error: err.message });
  } else if (err instanceof ValidationError) {
    res.status(400).json({ error: err.message });
  } else {
    res.status(500).json({ error: 'Internal error' });
  }
}

function sessionOf(req: Request): Session {
  const s = getSession(req);
  return { userId: s.userId, email: s.email };
}

/**
 * Mount all group-scoped routes. Every handler resolves the session and defers
 * to the authorization service, which denies by default. The UI never bypasses
 * these checks.
 */
export function mountGroupRoutes(app: Express, repo: GroupRepository, notifier?: NotifierDeps): void {
  const handle =
    (fn: (session: Session, req: Request) => Promise<unknown>) =>
    async (req: Request, res: Response) => {
      try {
        const out = await fn(sessionOf(req), req);
        res.json(out ?? { ok: true });
      } catch (err) {
        mapError(err, res);
      }
    };

  app.get('/api/groups', handle(async (s) => ({ groups: await listMyGroups(repo, s) })));
  app.get('/api/groups/:id', handle((s, req) => getGroupView(repo, s, req.params.id)));

  // Invites
  app.get(
    '/api/groups/:id/invites',
    handle(async (s, req) => ({ invites: await listInvites(repo, s, req.params.id) })),
  );
  app.post(
    '/api/groups/:id/invites',
    handle(async (s, req) => {
      const invite = await createInvite(repo, s, req.params.id, req.body?.email, req.body?.role);
      if (notifier) await emitSafe(() => onInviteCreated(notifier, invite));
      return invite;
    }),
  );
  app.post(
    '/api/groups/:id/invites/:inviteId/revoke',
    handle(async (s, req) => {
      const invites = await repo.invitesForGroup(req.params.id);
      const invite = invites.find((i) => i.id === req.params.inviteId);
      await revokeInvite(repo, s, req.params.id, req.params.inviteId);
      if (notifier && invite) await emitSafe(() => onInviteRevoked(notifier, invite));
      return { ok: true };
    }),
  );
  app.post(
    '/api/invites/accept',
    handle(async (s, req) => {
      const token = req.body?.token;
      const invite = typeof token === 'string' ? await repo.inviteByToken(token) : undefined;
      const out = await acceptInvite(repo, s, token);
      if (notifier && invite) await emitSafe(() => onInviteAccepted(notifier, invite, s.userId));
      return out;
    }),
  );
  app.post(
    '/api/invites/decline',
    handle(async (s, req) => {
      const token = req.body?.token;
      const invite = typeof token === 'string' ? await repo.inviteByToken(token) : undefined;
      await declineInvite(repo, s, token);
      if (notifier && invite) await emitSafe(() => onInviteDeclined(notifier, invite));
      return { ok: true };
    }),
  );
  app.post('/api/groups/:id/leave', handle((s, req) => leaveGroup(repo, s, req.params.id)));

  // Leave requests + approval
  app.get(
    '/api/groups/:id/leave-requests',
    handle(async (s, req) => ({ requests: await listLeaveRequests(repo, s, req.params.id) })),
  );
  app.post(
    '/api/groups/:id/leave-requests',
    handle(async (s, req) => {
      const out = await createLeaveRequest(repo, s, req.params.id, req.body ?? {});
      if (notifier && out.request.state === 'pending') {
        await emitSafe(() => onLeaveRequested(notifier, out.request));
      }
      return out;
    }),
  );
  app.post(
    '/api/leave-requests/:id/decide',
    handle(async (s, req) => {
      const updated = await decideLeaveRequest(repo, s, req.params.id, req.body?.decision, req.body?.reason);
      if (notifier) await emitSafe(() => onLeaveDecided(notifier, updated));
      return updated;
    }),
  );

  // Plan sharing
  app.post(
    '/api/plan-shares',
    handle(async (s, req) => {
      const share = await createPlanShare(repo, s, req.body ?? {});
      if (notifier) await emitSafe(() => onPlanShared(notifier, share));
      return share;
    }),
  );
  app.delete('/api/plan-shares/:id', handle((s, req) => revokePlanShare(repo, s, req.params.id)));
  app.get('/api/plans/:planId/access', handle((s, req) => planAccess(repo, s, req.params.planId)));
}
