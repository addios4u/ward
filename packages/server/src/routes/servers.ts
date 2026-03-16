import { Router, Request, Response, NextFunction } from 'express';
import { getDb, schema } from '../db/index.js';
import { eq, desc } from 'drizzle-orm';
import { safeGet, REDIS_KEYS } from '../lib/redis.js';
import { sessionAuth } from '../middleware/sessionAuth.js';

const router: Router = Router();

// 모든 서버 관리 API에 세션 인증 적용
router.use(sessionAuth);

// GET /api/servers — 서버 목록 조회 (최신 메트릭 Redis 캐시 활용)
router.get('/', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const db = getDb();
    const serverList = await db
      .select({
        id: schema.servers.id,
        name: schema.servers.name,
        hostname: schema.servers.hostname,
        groupName: schema.servers.groupName,
        publicIp: schema.servers.publicIp,
        country: schema.servers.country,
        city: schema.servers.city,
        isp: schema.servers.isp,
        osName: schema.servers.osName,
        osVersion: schema.servers.osVersion,
        arch: schema.servers.arch,
        status: schema.servers.status,
        lastSeenAt: schema.servers.lastSeenAt,
        createdAt: schema.servers.createdAt,
      })
      .from(schema.servers)
      .orderBy(schema.servers.createdAt);

    // 각 서버의 최신 메트릭을 Redis 캐시에서 조회
    const serversWithMetrics = await Promise.all(
      serverList.map(async (server) => {
        let latestMetrics: {
          cpuUsage: number | null;
          memTotal: number | null;
          memUsed: number | null;
          diskUsage: unknown | null;
          loadAvg: number[] | null;
        } | null = null;

        // Redis 캐시에서 먼저 조회
        const cached = await safeGet(REDIS_KEYS.latestMetrics(server.id));
        if (cached) {
          try {
            const parsedCache = JSON.parse(cached) as {
              cpu?: { usage?: number; loadAvg?: number[] };
              memory?: { total?: number; used?: number };
              disk?: unknown;
            };
            // Redis 캐시는 MetricsPayload 형식 (cpu.usage, memory.total 등)
            // → 정규화된 형식으로 변환
            latestMetrics = {
              cpuUsage: parsedCache.cpu?.usage ?? null,
              memTotal: parsedCache.memory?.total ?? null,
              memUsed: parsedCache.memory?.used ?? null,
              diskUsage: parsedCache.disk ?? null,
              loadAvg: parsedCache.cpu?.loadAvg ?? null,
            };
          } catch {
            // 파싱 실패 시 무시
          }
        }

        // Redis에 없으면 DB에서 가장 최근 메트릭 조회
        if (!latestMetrics) {
          const [dbMetrics] = await db
            .select()
            .from(schema.metrics)
            .where(eq(schema.metrics.serverId, server.id))
            .orderBy(desc(schema.metrics.collectedAt))
            .limit(1);

          if (dbMetrics) {
            // DB 메트릭은 이미 정규화된 형식 (cpuUsage, memTotal 등)
            latestMetrics = {
              cpuUsage: dbMetrics.cpuUsage ?? null,
              memTotal: dbMetrics.memTotal ?? null,
              memUsed: dbMetrics.memUsed ?? null,
              diskUsage: dbMetrics.diskUsage ?? null,
              loadAvg: dbMetrics.loadAvg ?? null,
            };
          }
        }

        return {
          ...server,
          latestMetrics,
        };
      })
    );

    res.json({ servers: serversWithMetrics });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/servers/:id — 서버 삭제
router.delete('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params['id'] as string;
    const db = getDb();

    const [deleted] = await db
      .delete(schema.servers)
      .where(eq(schema.servers.id, id))
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

export default router;
