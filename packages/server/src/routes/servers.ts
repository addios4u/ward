import { Router, Request, Response, NextFunction } from 'express';
import { getDb, schema } from '../db/index.js';
import { eq, desc } from 'drizzle-orm';
import { generateApiKey } from '../lib/apiKey.js';
import { safeGet, REDIS_KEYS } from '../lib/redis.js';
import { sessionAuth } from '../middleware/sessionAuth.js';

const router = Router();

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
        status: schema.servers.status,
        lastSeenAt: schema.servers.lastSeenAt,
        createdAt: schema.servers.createdAt,
      })
      .from(schema.servers)
      .orderBy(schema.servers.createdAt);

    // 각 서버의 최신 메트릭을 Redis 캐시에서 조회
    const serversWithMetrics = await Promise.all(
      serverList.map(async (server) => {
        let latestMetrics: unknown = null;

        // Redis 캐시에서 먼저 조회
        const cached = await safeGet(REDIS_KEYS.latestMetrics(server.id));
        if (cached) {
          try {
            latestMetrics = JSON.parse(cached);
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
          latestMetrics = dbMetrics ?? null;
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

// POST /api/servers — 서버 등록 + API 키 발급
router.post('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { name, hostname } = req.body as { name?: string; hostname?: string };

    if (!name || typeof name !== 'string' || name.trim() === '') {
      res.status(400).json({ error: 'name은 필수입니다.' });
      return;
    }

    if (!hostname || typeof hostname !== 'string' || hostname.trim() === '') {
      res.status(400).json({ error: 'hostname은 필수입니다.' });
      return;
    }

    const apiKey = generateApiKey();
    const db = getDb();

    const [newServer] = await db
      .insert(schema.servers)
      .values({
        name: name.trim(),
        hostname: hostname.trim(),
        apiKey,
        status: 'unknown',
      })
      .returning();

    res.status(201).json({
      server: {
        id: newServer.id,
        name: newServer.name,
        hostname: newServer.hostname,
        status: newServer.status,
        createdAt: newServer.createdAt,
      },
      apiKey, // 최초 발급 시에만 반환
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/servers/:id — 서버 삭제
router.delete('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
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
