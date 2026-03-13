import express from 'express';
import cors from 'cors';
import session from 'express-session';
import { RedisStore } from 'connect-redis';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import healthRouter from './routes/health.js';
import serversRouter from './routes/servers.js';
import agentRouter from './routes/agent.js';
import authRouter from './routes/auth.js';
import metricsRouter from './routes/metrics.js';
import logsRouter from './routes/logs.js';
import { WsManager } from './websocket/WsManager.js';
import { getSessionStoreClient } from './lib/redis.js';
import { config } from './config/index.js';

export function createApp() {
  const app = express();

  // 보안 헤더
  app.use(helmet());

  // CORS: ALLOWED_ORIGINS 환경변수로 허용 origin 지정
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
    : ['http://localhost:3000', 'http://localhost:4000'];

  app.use(cors({
    origin: (origin, callback) => {
      // origin이 없는 요청(서버 간 요청 등)은 허용
      if (!origin) {
        callback(null, true);
        return;
      }
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS 정책에 의해 차단됨: ${origin}`));
      }
    },
    credentials: true,
  }));

  app.use(express.json());

  // 세션 미들웨어 (express-session + connect-redis)
  const sessionSecret = config.session.secret;
  if (!sessionSecret && process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET 환경변수가 설정되지 않았습니다. 프로덕션 환경에서는 필수입니다.');
  }

  const store = new RedisStore({
    client: getSessionStoreClient() as any,
    prefix: 'ward:session:',
  });

  app.use(session({
    store,
    secret: sessionSecret || 'dev-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7일
    },
  }));

  // Rate Limiting: API 전체 분당 100회
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: '요청 횟수 초과. 잠시 후 다시 시도해주세요.' },
  });

  // Rate Limiting: 로그인 엔드포인트 분당 10회
  const loginLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: '로그인 시도 횟수 초과. 잠시 후 다시 시도해주세요.' },
  });

  // 에이전트 엔드포인트: 분당 500회 (더 높은 한도)
  const agentLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 500,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: '에이전트 요청 횟수 초과.' },
  });

  // 라우터
  app.use('/health', healthRouter);
  app.use('/api/auth/login', loginLimiter);
  app.use('/api/auth', authRouter);
  app.use('/api/agent', agentLimiter, agentRouter);
  app.use('/api/servers', apiLimiter, serversRouter);
  app.use('/api/servers', apiLimiter, metricsRouter);
  app.use('/api/servers', apiLimiter, logsRouter);

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
