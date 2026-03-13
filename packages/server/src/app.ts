import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import session from 'express-session';
import { RedisStore } from 'connect-redis';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { RedisStore as RateLimitRedisStore } from 'rate-limit-redis';
import { createServer } from 'http';
import path from 'path';
import fs from 'fs';
import healthRouter from './routes/health.js';
import serversRouter from './routes/servers.js';
import agentRouter from './routes/agent.js';
import authRouter from './routes/auth.js';
import metricsRouter from './routes/metrics.js';
import logsRouter from './routes/logs.js';
import servicesRouter, { processesRouter } from './routes/services.js';
import usersRouter from './routes/users.js';
import { WsManager } from './websocket/WsManager.js';
import { getSessionStoreClient, getRateLimitClient } from './lib/redis.js';
import { config } from './config/index.js';

export function createApp(): express.Application {
  const app = express();

  // Nginx 프록시 환경에서 req.ip가 올바른 클라이언트 IP를 반환하도록 설정
  app.set('trust proxy', 1);

  // 보안 헤더 (crossOriginResourcePolicy는 CORS로 별도 처리)
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }));

  // CORS: 인프라 단계(보안 그룹 등)에서 접근 제어하므로 모든 origin 허용
  app.use(cors({
    origin: true,
    credentials: true,
  }));

  // HTTP access log (stdout → ServiceWatcher가 캡처해서 대시보드로 전달)
  app.use(morgan('combined'));

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.use((session as any)({
    store,
    name: 'ward.sid',
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

  // rate-limit-redis 전용 클라이언트 (enableOfflineQueue: true로 연결 전 명령 큐잉)
  const ioRedis = getRateLimitClient();
  const sendCommand = async (command: string, ...args: string[]): Promise<import('rate-limit-redis').RedisReply> => {
    const method = (ioRedis as any)[command.toLowerCase()];
    if (typeof method === 'function') {
      return await method.apply(ioRedis, args) as import('rate-limit-redis').RedisReply;
    }
    throw new Error(`Unknown Redis command: ${command}`);
  };

  // Rate Limiting: API 전체 분당 100회
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: '요청 횟수 초과. 잠시 후 다시 시도해주세요.' },
    store: new RateLimitRedisStore({
      sendCommand,
      prefix: 'ward:rl:api:',
    }),
  });

  // Rate Limiting: 로그인 엔드포인트 분당 10회
  const loginLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: '로그인 시도 횟수 초과. 잠시 후 다시 시도해주세요.' },
    store: new RateLimitRedisStore({
      sendCommand,
      prefix: 'ward:rl:login:',
    }),
  });

  // 에이전트 엔드포인트: 분당 500회 (더 높은 한도)
  const agentLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 500,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: '에이전트 요청 횟수 초과.' },
    store: new RateLimitRedisStore({
      sendCommand,
      prefix: 'ward:rl:agent:',
    }),
  });

  // 라우터
  app.use('/health', healthRouter);
  app.use('/api/auth/login', loginLimiter);
  app.use('/api/auth', authRouter);
  app.use('/api/agent', agentLimiter, agentRouter);
  app.use('/api/servers', apiLimiter, serversRouter);
  app.use('/api/servers', apiLimiter, metricsRouter);
  app.use('/api/servers', apiLimiter, logsRouter);
  app.use('/api/servers', apiLimiter, processesRouter);
  app.use('/api/services', apiLimiter, servicesRouter);
  app.use('/api/users', apiLimiter, usersRouter);

  // 프로덕션: web/dist 정적 파일 서빙
  // 개발: Vite dev server가 별도로 실행되므로 스킵
  const webDistPath = path.resolve(__dirname, '../../web/dist');
  if (fs.existsSync(webDistPath)) {
    app.use(express.static(webDistPath));
    // SPA fallback — /api/* 이외의 모든 GET 요청에 index.html 반환
    app.get('*', (_req, res) => {
      res.sendFile(path.join(webDistPath, 'index.html'));
    });
  }

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
