/**
 * Auth seam. By default returns a local dev session (the seeded demo user) so
 * the app runs with zero keys. When AUTH_PROVIDER is set (e.g. 'authjs'), this
 * is where a real Auth.js / Clerk session lookup would plug in.
 */
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

export function getSession(): Session {
  const provider = process.env.AUTH_PROVIDER;
  if (!provider || provider === 'local') return DEV_SESSION;
  // TODO: real integration — resolve an Auth.js / Clerk session here.
  // Until wired, fall back to the dev session so the app stays usable.
  return { ...DEV_SESSION, provider };
}
