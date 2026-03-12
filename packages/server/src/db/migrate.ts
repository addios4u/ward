import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import path from 'path';
import { config } from '../config/index.js';

async function runMigrations() {
  console.log('마이그레이션 시작...');

  const pool = new Pool({
    connectionString: config.db.url || undefined,
    host: config.db.url ? undefined : config.db.host,
    port: config.db.url ? undefined : config.db.port,
    database: config.db.url ? undefined : config.db.database,
    user: config.db.url ? undefined : config.db.user,
    password: config.db.url ? undefined : config.db.password,
  });

  const db = drizzle(pool);

  await migrate(db, {
    migrationsFolder: path.resolve(import.meta.dirname, 'migrations'),
  });

  await pool.end();
  console.log('마이그레이션 완료!');
}

runMigrations().catch((err) => {
  console.error('마이그레이션 실패:', err);
  process.exit(1);
});
