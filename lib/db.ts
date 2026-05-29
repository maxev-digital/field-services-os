import { Pool } from 'pg';

const globalForPg = globalThis as unknown as { pgPool: Pool };

const pool =
  globalForPg.pgPool ??
  new Pool({ connectionString: process.env.DATABASE_URL });

if (process.env.NODE_ENV !== 'production') globalForPg.pgPool = pool;

/** Returns the shared pg Pool (has .query() method). */
export async function getDb(): Promise<Pool> {
  return pool;
}
