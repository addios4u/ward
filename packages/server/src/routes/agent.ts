import { Router, Request, Response, NextFunction } from 'express';
import { getDb, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { serverIdentify } from '../middleware/serverIdentify.js';
import { safePublish, safeSet, REDIS_CHANNELS, REDIS_KEYS } from '../lib/redis.js';

// serverIdentify가 req에 첨부하는 서버 정보 타입
type IdentifiedRequest = Request & { server: typeof schema.servers.$inferSelect };

const router = Router();

// POST /api/agent/register — 에이전트 자동 등록 (인증 없음)
router.post('/register', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { hostname, groupName } = req.body as { hostname?: string; groupName?: string };

    if (!hostname) {
      res.status(400).json({ error: 'hostname은 필수입니다.' });
      return;
    }

    const db = getDb();

    // 동일 hostname이 이미 있으면 해당 서버 ID 반환 (재등록 허용)
    const existing = await db
      .select()
      .from(schema.servers)
      .where(eq(schema.servers.hostname, hostname))
      .limit(1);

    if (existing[0]) {
      // groupName 업데이트
      await db
        .update(schema.servers)
        .set({
          groupName: groupName ?? null,
          status: 'unknown',
        })
        .where(eq(schema.servers.id, existing[0].id));

      res.json({ serverId: existing[0].id });
      return;
    }

    const [newServer] = await db
      .insert(schema.servers)
      .values({
        name: hostname,
        hostname,
        groupName: groupName ?? null,
        status: 'unknown',
      })
      .returning();

    res.status(201).json({ serverId: newServer.id });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/agent/unregister — 에이전트 등록 해제 (x-ward-server-id 헤더)
router.delete('/unregister', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const serverId = req.headers['x-ward-server-id'] as string;

    if (!serverId) {
      res.status(400).json({ error: 'x-ward-server-id 헤더가 필요합니다.' });
      return;
    }

    const db = getDb();
    const [deleted] = await db
      .delete(schema.servers)
      .where(eq(schema.servers.id, serverId))
      .returning({ id: schema.servers.id });

    if (!deleted) {
      res.status(404).json({ error: '서버를 찾을 수 없습니다.' });
      return;
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// 이하 모든 에이전트 라우트에 serverIdentify 적용
router.use(serverIdentify);

// POST /api/agent/metrics — 에이전트 메트릭 수신 + DB 저장 + Redis 캐시/발행
router.post('/metrics', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const server = (req as IdentifiedRequest).server;
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
    const server = (req as IdentifiedRequest).server;
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
    const server = (req as IdentifiedRequest).server;
    const db = getDb();

    const { ipInfo } = req.body as {
      sentAt?: string;
      hostname?: string;
      ipInfo?: { ip?: string; country?: string; city?: string; isp?: string };
    };

    await db
      .update(schema.servers)
      .set({
        status: 'online',
        lastSeenAt: new Date(),
        ...(ipInfo?.ip && { publicIp: ipInfo.ip }),
        ...(ipInfo?.country && { country: ipInfo.country }),
        ...(ipInfo?.city && { city: ipInfo.city }),
        ...(ipInfo?.isp && { isp: ipInfo.isp }),
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

export default router;
