import { Router, Request, Response, NextFunction } from 'express';
import { getDb, schema } from '../db/index.js';
import { eq, desc } from 'drizzle-orm';
import { jwtAuth } from '../middleware/jwtAuth.js';

const router = Router();

// 모든 메트릭 라우트에 JWT 인증 적용
router.use(jwtAuth);

// GET /api/servers/:id/metrics — 메트릭 히스토리 조회
router.get('/:id/metrics', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const limit = parseInt(req.query['limit'] as string ?? '60', 10);

    const db = getDb();

    // 서버 존재 여부 확인
    const [server] = await db
      .select({ id: schema.servers.id })
      .from(schema.servers)
      .where(eq(schema.servers.id, id))
      .limit(1);

    if (!server) {
      res.status(404).json({ error: '서버를 찾을 수 없습니다.' });
      return;
    }

    const metricsList = await db
      .select()
      .from(schema.metrics)
      .where(eq(schema.metrics.serverId, id))
      .orderBy(desc(schema.metrics.collectedAt))
      .limit(limit);

    res.json({ metrics: metricsList.reverse() });
  } catch (err) {
    next(err);
  }
});

// GET /api/servers/:id/status — 최신 상태 조회
router.get('/:id/status', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const db = getDb();

    const [server] = await db
      .select({
        id: schema.servers.id,
        name: schema.servers.name,
        hostname: schema.servers.hostname,
        status: schema.servers.status,
        lastSeenAt: schema.servers.lastSeenAt,
      })
      .from(schema.servers)
      .where(eq(schema.servers.id, id))
      .limit(1);

    if (!server) {
      res.status(404).json({ error: '서버를 찾을 수 없습니다.' });
      return;
    }

    // 최신 메트릭 1건 조회
    const [latestMetric] = await db
      .select()
      .from(schema.metrics)
      .where(eq(schema.metrics.serverId, id))
      .orderBy(desc(schema.metrics.collectedAt))
      .limit(1);

    res.json({ server, latestMetric: latestMetric ?? null });
  } catch (err) {
    next(err);
  }
});

export default router;
