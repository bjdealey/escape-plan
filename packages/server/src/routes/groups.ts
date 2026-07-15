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
export function mountGroupRoutes(app: Express, repo: GroupRepository): void {
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
    handle((s, req) => createInvite(repo, s, req.params.id, req.body?.email, req.body?.role)),
  );
  app.post(
    '/api/groups/:id/invites/:inviteId/revoke',
    handle((s, req) => revokeInvite(repo, s, req.params.id, req.params.inviteId)),
  );
  app.post('/api/invites/accept', handle((s, req) => acceptInvite(repo, s, req.body?.token)));
  app.post('/api/invites/decline', handle((s, req) => declineInvite(repo, s, req.body?.token)));
  app.post('/api/groups/:id/leave', handle((s, req) => leaveGroup(repo, s, req.params.id)));

  // Leave requests + approval
  app.get(
    '/api/groups/:id/leave-requests',
    handle(async (s, req) => ({ requests: await listLeaveRequests(repo, s, req.params.id) })),
  );
  app.post(
    '/api/groups/:id/leave-requests',
    handle((s, req) => createLeaveRequest(repo, s, req.params.id, req.body ?? {})),
  );
  app.post(
    '/api/leave-requests/:id/decide',
    handle((s, req) => decideLeaveRequest(repo, s, req.params.id, req.body?.decision, req.body?.reason)),
  );

  // Plan sharing
  app.post('/api/plan-shares', handle((s, req) => createPlanShare(repo, s, req.body ?? {})));
  app.delete('/api/plan-shares/:id', handle((s, req) => revokePlanShare(repo, s, req.params.id)));
  app.get('/api/plans/:planId/access', handle((s, req) => planAccess(repo, s, req.params.planId)));
}
