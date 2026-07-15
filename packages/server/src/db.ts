import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

export const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgres://postgres:postgres@localhost:5432/escape_plan';

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new Pool({ connectionString: DATABASE_URL });
  }
  return pool;
}

/** True when a Postgres connection can be established. */
export async function isDbAvailable(): Promise<boolean> {
  try {
    const client = await getPool().connect();
    client.release();
    return true;
  } catch {
    return false;
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
