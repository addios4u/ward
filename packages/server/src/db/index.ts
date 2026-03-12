import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { config } from '../config/index.js';
import * as schema from './schema.js';

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: config.db.url,
      host: config.db.url ? undefined : config.db.host,
      port: config.db.url ? undefined : config.db.port,
      database: config.db.url ? undefined : config.db.database,
      user: config.db.url ? undefined : config.db.user,
      password: config.db.url ? undefined : config.db.password,
    });
  }
  return pool;
}

export function getDb() {
  return drizzle(getPool(), { schema });
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export { schema };
