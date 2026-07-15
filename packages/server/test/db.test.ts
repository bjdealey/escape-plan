import { afterAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { AuthorizationError } from '@escape-plan/engine';
import { applyMigration, rollbackMigration, runMigrations } from '../src/migrate.js';
import { runSeed } from '../src/seed.js';
import { PgRepository } from '../src/repository/pg.js';
import { PgNotificationStore } from '../src/notifications/pg.js';
import { getGroupView, requireMembership } from '../src/access.js';

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

  it('migrates a pre-existing single user to a group-of-one and rolls back cleanly', async () => {
    // Start from the pre-Phase-3 schema only.
    await rollbackMigration(pool!, '002_groups.sql', () => {}).catch(() => {});
    await applyMigration(pool!, '001_init.sql', () => {});

    // A legacy single-user dataset (no groups exist).
    await pool!.query("DELETE FROM users WHERE email = 'legacy@escape-plan.app'");
    const { rows } = await pool!.query(
      "INSERT INTO users (name, email) VALUES ('Legacy', 'legacy@escape-plan.app') RETURNING id",
    );
    const legacyId = rows[0].id as number;

    // Apply Phase-3 migration → the user becomes owner of a group-of-one.
    await applyMigration(pool!, '002_groups.sql', () => {});
    const membership = await pool!.query(
      'SELECT group_id, role FROM group_members WHERE user_id = $1',
      [legacyId],
    );
    expect(membership.rows).toHaveLength(1);
    expect(membership.rows[0].role).toBe('owner');
    expect(membership.rows[0].group_id).toBe(`g-user-${legacyId}`);

    // Rollback drops the group tables but keeps the user (no data loss).
    await rollbackMigration(pool!, '002_groups.sql', () => {});
    const stillThere = await pool!.query('SELECT id FROM users WHERE id = $1', [legacyId]);
    expect(stillThere.rows).toHaveLength(1);
    const tableGone = await pool!.query(
      "SELECT to_regclass('public.group_members') AS t",
    );
    expect(tableGone.rows[0].t).toBeNull();

    // Restore for any following tests.
    await applyMigration(pool!, '002_groups.sql', () => {});
  });

  it('enforces authorization against the Postgres repository', async () => {
    await runMigrations(pool!, () => {});
    await runSeed(pool!, () => {});
    const repo = new PgRepository(pool!);

    // Member can read the group view; non-member is denied.
    const view = await getGroupView(repo, { userId: 1, email: 'demo@escape-plan.app' }, 'g-team');
    expect(view.myRole).toBe('member');
    await expect(
      requireMembership(repo, 2, 'g-team'), // Sam is not in g-team
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it('applies the notifications migration, seeds notifications, and the pg store is idempotent', async () => {
    await runMigrations(pool!, () => {});
    await runSeed(pool!, () => {});
    const store = new PgNotificationStore(pool!);

    // Seeded in-app notifications exist.
    const feed = await store.listInApp(1);
    expect(feed.length).toBeGreaterThan(0);

    // Enqueue + dedup: a repeated (dedupKey, channel) is a no-op.
    const item = {
      id: 'obx-db-1', userId: 1, email: 'demo@escape-plan.app', channel: 'email' as const,
      type: 'leave.approved' as const, subject: 's', body: 'b', link: 'group',
      status: 'pending' as const, attempts: 0, nextAttemptAt: new Date().toISOString(),
      dedupKey: 'db-dedup-1', createdAt: new Date().toISOString(),
    };
    expect(await store.enqueueOutbox(item)).toBe(true);
    expect(await store.enqueueOutbox({ ...item, id: 'obx-db-2' })).toBe(false);

    // 003 rolls back cleanly, leaving users intact.
    await rollbackMigration(pool!, '003_notifications.sql', () => {});
    const gone = await pool!.query("SELECT to_regclass('public.notifications') AS t");
    expect(gone.rows[0].t).toBeNull();
    const users = await pool!.query("SELECT count(*)::int AS n FROM users");
    expect(users.rows[0].n).toBeGreaterThan(0);
    await applyMigration(pool!, '003_notifications.sql', () => {});
  });
});
