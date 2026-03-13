import { createHttpServer } from './app.js';
import { config } from './config/index.js';
import { getPool, closePool } from './db/index.js';
import { CleanupService } from './services/CleanupService.js';
import { HeartbeatMonitor } from './services/HeartbeatMonitor.js';
import { AdminSeeder } from './services/AdminSeeder.js';
import { closeRedis } from './lib/redis.js';

async function main() {
  // DB 연결 확인
  const pool = getPool();
  await pool.query('SELECT 1');
  console.log('DB 연결 성공');

  // 초기 관리자 계정 시드
  const seeder = new AdminSeeder();
  await seeder.seed();

  const { httpServer, wsManager } = createHttpServer();
  const { port, host } = config.server;

  // 데이터 자동 정리 서비스 시작
  const cleanupService = new CleanupService();
  cleanupService.start();

  // 서버 offline 감지 스케줄러 시작
  const heartbeatMonitor = new HeartbeatMonitor();
  heartbeatMonitor.start();

  // 프로세스 종료 시 정리
  const shutdown = async () => {
    cleanupService.stop();
    heartbeatMonitor.stop();
    wsManager.close();
    await closePool();
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
