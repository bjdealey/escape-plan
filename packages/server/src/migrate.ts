import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type pg from 'pg';
import { closePool, getPool } from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', 'migrations');

async function ensureMigrationsTable(pool: pg.Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

/** Up-migration files, sorted; `.down.sql` rollback files are excluded. */
function upFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
    .sort();
}

/** Apply a single up-migration in a transaction and record it. Idempotent. */
export async function applyMigration(pool: pg.Pool, file: string, log = console.log): Promise<void> {
  await ensureMigrationsTable(pool);
  const { rows } = await pool.query<{ name: string }>(
    'SELECT name FROM schema_migrations WHERE name = $1',
    [file],
  );
  if (rows.length > 0) {
    log(`• skip   ${file}`);
    return;
  }
  const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
  log(`▶ apply  ${file}`);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [file]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Roll back a single migration using its `<name>.down.sql` file. */
export async function rollbackMigration(pool: pg.Pool, file: string, log = console.log): Promise<void> {
  const downFile = file.replace(/\.sql$/, '.down.sql');
  const sql = readFileSync(join(MIGRATIONS_DIR, downFile), 'utf8');
  log(`◀ revert ${file}`);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('DELETE FROM schema_migrations WHERE name = $1', [file]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Roll back the most recently applied migration. */
export async function rollbackLast(pool: pg.Pool, log = console.log): Promise<string | null> {
  await ensureMigrationsTable(pool);
  const { rows } = await pool.query<{ name: string }>(
    'SELECT name FROM schema_migrations ORDER BY applied_at DESC, name DESC LIMIT 1',
  );
  if (rows.length === 0) {
    log('nothing to roll back');
    return null;
  }
  await rollbackMigration(pool, rows[0].name, log);
  return rows[0].name;
}

/** Apply all pending SQL migrations against the given pool. Idempotent. */
export async function runMigrations(pool: pg.Pool, log = console.log): Promise<void> {
  await ensureMigrationsTable(pool);
  for (const file of upFiles()) await applyMigration(pool, file, log);
  log('✓ migrations complete');
}

// CLI entry point. `tsx src/migrate.ts` applies; `... rollback` reverts the last.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const action = process.argv[2] === 'rollback' ? rollbackLast : runMigrations;
  action(getPool())
    .catch((err) => {
      console.error('Migration failed:', err.message);
      process.exitCode = 1;
    })
    .finally(() => closePool());
}
