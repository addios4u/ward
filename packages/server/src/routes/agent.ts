import { Router, Request, Response, NextFunction } from 'express';
import { getDb, schema } from '../db/index.js';
import { agentAuth } from '../middleware/agentAuth.js';
import { safePublish, safeSet, REDIS_CHANNELS, REDIS_KEYS } from '../lib/redis.js';

// agentAuth가 req에 첨부하는 서버 정보 타입
type AuthenticatedRequest = Request & { server: typeof schema.servers.$inferSelect };

const router = Router();

// 모든 에이전트 라우트에 인증 적용
router.use(agentAuth);

// POST /api/agent/metrics — 에이전트 메트릭 수신 + DB 저장 + Redis 캐시/발행
router.post('/metrics', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const server = (req as AuthenticatedRequest).server;
    const body = req.body as {
      collectedAt?: string;
      cpu?: { usage?: number; loadAvg?: number[] };
      memory?: { total?: number; used?: number; free?: number };
      disk?: Record<string, { total: number; used: number; free: number }>;
      network?: Record<string, { rx: number; tx: number }>;
      processes?: Array<{ pid: number; name: string; cpu: number; memory: number }>;
    };

    if (!body.collectedAt) {
      res.status(400).json({ error: 'collectedAt은 필수입니다.' });
      return;
    }

    // collectedAt이 유효한 날짜인지 검증
    const collectedAtDate = new Date(body.collectedAt);
    if (isNaN(collectedAtDate.getTime())) {
      res.status(400).json({ error: 'collectedAt이 유효한 날짜 형식이 아닙니다.' });
      return;
    }

    const db = getDb();

    // metrics 테이블에 저장
    await db.insert(schema.metrics).values({
      serverId: server.id,
      collectedAt: collectedAtDate,
      cpuUsage: body.cpu?.usage ?? null,
      memTotal: body.memory?.total ?? null,
      memUsed: body.memory?.used ?? null,
      diskUsage: body.disk ?? null,
      networkIo: body.network ?? null,
      loadAvg: body.cpu?.loadAvg ?? null,
    });

    // processes 테이블에 저장
    if (body.processes && body.processes.length > 0) {
      await db.insert(schema.processes).values(
        body.processes.map((p) => ({
          serverId: server.id,
          collectedAt: collectedAtDate,
          pid: p.pid,
          name: p.name,
          cpuUsage: p.cpu,
          memUsage: p.memory,
        }))
      );
    }

    // Redis 최신 메트릭 캐시 (TTL: 60초)
    const metricsJson = JSON.stringify(body);
    await safeSet(REDIS_KEYS.latestMetrics(server.id), metricsJson, 60);

    // Redis Pub/Sub 발행
    await safePublish(REDIS_CHANNELS.metrics(server.id), metricsJson);

    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/agent/logs — 에이전트 로그 배치 수신 + DB 저장 + Redis 발행
router.post('/logs', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const server = (req as AuthenticatedRequest).server;
    const body = req.body as {
      logs?: Array<{
        source?: string;
        level?: string;
        message?: string;
        loggedAt?: string;
      }>;
    };

    if (!body.logs || !Array.isArray(body.logs) || body.logs.length === 0) {
      res.status(400).json({ error: 'logs 배열은 필수입니다.' });
      return;
    }

    // 최대 1000건으로 제한
    if (body.logs.length > 1000) {
      res.status(400).json({ error: 'logs 배열은 최대 1000건까지 허용됩니다.' });
      return;
    }

    const db = getDb();

    await db.insert(schema.logs).values(
      body.logs.map((log) => ({
        serverId: server.id,
        source: log.source ?? null,
        level: log.level ?? null,
        message: log.message ?? '',
        loggedAt: new Date(log.loggedAt ?? Date.now()),
      }))
    );

    // Redis Pub/Sub 발행
    await safePublish(REDIS_CHANNELS.logs(server.id), JSON.stringify(body.logs));

    res.status(201).json({ ok: true, count: body.logs.length });
  } catch (err) {
    next(err);
  }
});

// POST /api/agent/heartbeat — heartbeat 수신 + server status를 online으로 업데이트 + Redis 캐시/발행
router.post('/heartbeat', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const server = (req as AuthenticatedRequest).server;
    const db = getDb();

    const { eq } = await import('drizzle-orm');

    await db
      .update(schema.servers)
      .set({
        status: 'online',
        lastSeenAt: new Date(),
      })
      .where(eq(schema.servers.id, server.id));

    // Redis 상태 캐시 (TTL: 90초)
    await safeSet(REDIS_KEYS.latestStatus(server.id), 'online', 90);

    // Redis Pub/Sub 발행
    await safePublish(
      REDIS_CHANNELS.serverStatus,
      JSON.stringify({ serverId: server.id, status: 'online' })
    );

    res.json({ ok: true, serverId: server.id });
  } catch (err) {
    next(err);
  }
});

// GET /api/agent/config — 에이전트 설정 반환
router.get('/config', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const server = (req as AuthenticatedRequest).server;

    // 현재는 기본 설정을 반환; 추후 DB에서 서버별 설정을 가져올 수 있음
    res.json({
      serverId: server.id,
      config: {
        metricsIntervalSec: 30,
        heartbeatIntervalSec: 60,
        logBatchSize: 100,
        logFlushIntervalSec: 5,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
