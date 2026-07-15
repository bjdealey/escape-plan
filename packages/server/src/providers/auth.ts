/**
 * Auth seam. By default returns a local dev session (the seeded demo user) so
 * the app runs with zero keys. When AUTH_PROVIDER is set (e.g. 'authjs'), this
 * is where a real Auth.js / Clerk session lookup would plug in.
 *
 * DEV MULTI-USER: outside production, and only while no real auth provider is
 * configured, the request may carry an `x-user-id` header to "act as" one of the
 * seeded users. This is how the multi-user demo and E2E switch identities
 * without a real IdP. It is IGNORED when AUTH_PROVIDER is a real provider or in
 * production, so it can never be used to impersonate in a deployed environment.
 */
import { DEMO_USERS } from '@escape-plan/engine';

export interface Session {
  userId: number;
  name: string;
  email: string;
  provider: string;
}

const DEV_SESSION: Session = {
  userId: 1,
  name: 'Demo User',
  email: 'demo@escape-plan.app',
  provider: 'local-dev',
};

interface RequestLike {
  headers?: Record<string, string | string[] | undefined>;
}

function devSwitchAllowed(): boolean {
  const provider = process.env.AUTH_PROVIDER;
  const realAuth = provider && provider !== 'local';
  return !realAuth && process.env.NODE_ENV !== 'production';
}

export function getSession(req?: RequestLike): Session {
  const provider = process.env.AUTH_PROVIDER;
  if (provider && provider !== 'local') {
    // TODO: real integration — resolve an Auth.js / Clerk session here.
    // Until wired, fall back to the dev session so the app stays usable.
    return { ...DEV_SESSION, provider };
  }

  if (devSwitchAllowed()) {
    const raw = req?.headers?.['x-user-id'];
    const value = Array.isArray(raw) ? raw[0] : raw;
    const id = value ? Number(value) : DEV_SESSION.userId;
    if (Number.isInteger(id)) {
      const user = DEMO_USERS.find((u) => u.id === id);
      if (user) return { userId: user.id, name: user.name, email: user.email, provider: 'local-dev' };
    }
  }
  return DEV_SESSION;
}
