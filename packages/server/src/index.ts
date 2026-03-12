import { createHttpServer } from './app.js';
import { config } from './config/index.js';
import { getPool } from './db/index.js';
import { CleanupService } from './services/CleanupService.js';
import { closeRedis } from './lib/redis.js';

async function main() {
  // DB 연결 확인
  const pool = getPool();
  await pool.query('SELECT 1');
  console.log('DB 연결 성공');

  const { httpServer, wsManager } = createHttpServer();
  const { port, host } = config.server;

  // 데이터 자동 정리 서비스 시작
  const cleanupService = new CleanupService();
  cleanupService.start();

  // 프로세스 종료 시 정리
  const shutdown = async () => {
    cleanupService.stop();
    wsManager.close();
    await closeRedis();
    process.exit(0);
  };

  process.on('SIGTERM', () => { shutdown().catch(console.error); });
  process.on('SIGINT', () => { shutdown().catch(console.error); });

  httpServer.listen(port, host, () => {
    console.log(`Ward 서버 시작: http://${host}:${port}`);
    console.log(`WebSocket 서버: ws://${host}:${port}/ws`);
  });
}

main().catch((err) => {
  console.error('서버 시작 실패:', err);
  process.exit(1);
});
