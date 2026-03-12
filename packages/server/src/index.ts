import { createApp } from './app.js';
import { config } from './config/index.js';
import { getPool } from './db/index.js';
import { CleanupService } from './services/CleanupService.js';

async function main() {
  // DB 연결 확인
  const pool = getPool();
  await pool.query('SELECT 1');
  console.log('DB 연결 성공');

  const app = createApp();
  const { port, host } = config.server;

  // 데이터 자동 정리 서비스 시작
  const cleanupService = new CleanupService();
  cleanupService.start();

  // 프로세스 종료 시 정리
  process.on('SIGTERM', () => {
    cleanupService.stop();
    process.exit(0);
  });
  process.on('SIGINT', () => {
    cleanupService.stop();
    process.exit(0);
  });

  app.listen(port, host, () => {
    console.log(`Ward 서버 시작: http://${host}:${port}`);
  });
}

main().catch((err) => {
  console.error('서버 시작 실패:', err);
  process.exit(1);
});
