import { afterAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { runMigrations } from '../src/migrate.js';
import { runSeed } from '../src/seed.js';

/**
 * DB-backed integration test. Runs ONLY when TEST_DATABASE_URL is set (CI
 * provides a Postgres service). Skipped offline — reported as skipped rather
 * than silently passing.
 */
const url = process.env.TEST_DATABASE_URL;
const pool = url ? new pg.Pool({ connectionString: url }) : null;

afterAll(async () => {
  await pool?.end();
});

describe.skipIf(!url)('migrations + seed against a real Postgres', () => {
  it('applies migrations idempotently and seeds the demo user', async () => {
    await runMigrations(pool!, () => {});
    // Second run is a no-op (idempotent).
    await runMigrations(pool!, () => {});

    const { userId, plans } = await runSeed(pool!, () => {});
    expect(userId).toBeGreaterThan(0);
    expect(plans).toBeGreaterThanOrEqual(3);

    const holidays = await pool!.query('SELECT count(*)::int AS n FROM holidays WHERE year = 2026');
    expect(holidays.rows[0].n).toBeGreaterThan(0);

    const climate = await pool!.query('SELECT count(*)::int AS n FROM climate');
    expect(climate.rows[0].n).toBe(9 * 12);

    // Re-seeding is idempotent (demo user replaced, not duplicated).
    await runSeed(pool!, () => {});
    const users = await pool!.query(
      "SELECT count(*)::int AS n FROM users WHERE email = 'demo@escape-plan.app'",
    );
    expect(users.rows[0].n).toBe(1);
  });
});
