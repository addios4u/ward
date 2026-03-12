import { createApp } from './app.js';
import { config } from './config/index.js';
import { getPool } from './db/index.js';

async function main() {
  // DB 연결 확인
  const pool = getPool();
  await pool.query('SELECT 1');
  console.log('DB 연결 성공');

  const app = createApp();
  const { port, host } = config.server;

  app.listen(port, host, () => {
    console.log(`Ward 서버 시작: http://${host}:${port}`);
  });
}

main().catch((err) => {
  console.error('서버 시작 실패:', err);
  process.exit(1);
});
