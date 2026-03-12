import { Router, Request, Response, NextFunction } from 'express';
import { getDb, schema } from '../db/index.js';
import { eq, desc, and } from 'drizzle-orm';
import { jwtAuth } from '../middleware/jwtAuth.js';

const router = Router();

// 모든 로그 라우트에 JWT 인증 적용
router.use(jwtAuth);

// GET /api/servers/:id/logs — 로그 조회 (레벨 필터, 페이지네이션)
router.get('/:id/logs', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const level = req.query['level'] as string | undefined;
    const limit = parseInt(req.query['limit'] as string ?? '100', 10);
    const offset = parseInt(req.query['offset'] as string ?? '0', 10);

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

    // 필터 조건 구성
    const conditions = [eq(schema.logs.serverId, id)];
    if (level && ['info', 'warn', 'error', 'debug'].includes(level)) {
      conditions.push(eq(schema.logs.level, level));
    }

    const logList = await db
      .select()
      .from(schema.logs)
      .where(and(...conditions))
      .orderBy(desc(schema.logs.loggedAt))
      .limit(limit)
      .offset(offset);

    res.json({ logs: logList.reverse(), limit, offset });
  } catch (err) {
    next(err);
  }
});

export default router;
