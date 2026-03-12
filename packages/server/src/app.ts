import express from 'express';
import cors from 'cors';
import healthRouter from './routes/health.js';
import serversRouter from './routes/servers.js';

export function createApp() {
  const app = express();

  // 미들웨어
  app.use(cors());
  app.use(express.json());

  // 라우터
  app.use('/health', healthRouter);
  app.use('/api/servers', serversRouter);

  // 에러 핸들러
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('서버 오류:', err);
    res.status(500).json({ error: '서버 내부 오류가 발생했습니다.' });
  });

  return app;
}
