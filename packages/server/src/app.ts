import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import healthRouter from './routes/health.js';
import serversRouter from './routes/servers.js';
import agentRouter from './routes/agent.js';
import authRouter from './routes/auth.js';
import metricsRouter from './routes/metrics.js';
import logsRouter from './routes/logs.js';
import { WsManager } from './websocket/WsManager.js';

export function createApp() {
  const app = express();

  // 미들웨어
  app.use(cors());
  app.use(express.json());

  // 라우터
  app.use('/health', healthRouter);
  app.use('/api/servers', serversRouter);
  app.use('/api/agent', agentRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/servers', metricsRouter);
  app.use('/api/servers', logsRouter);

  // 에러 핸들러
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('서버 오류:', err);
    res.status(500).json({ error: '서버 내부 오류가 발생했습니다.' });
  });

  return app;
}

/**
 * HTTP 서버 + WebSocket 서버 생성
 * WebSocket은 Redis Pub/Sub를 통해 실시간 메트릭/로그/상태를 클라이언트에 전달
 */
export function createHttpServer() {
  const app = createApp();
  const httpServer = createServer(app);
  const wsManager = new WsManager(httpServer);

  return { httpServer, wsManager };
}
