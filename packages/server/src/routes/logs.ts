import { Router, Request, Response, NextFunction } from 'express';
import { getDb, schema } from '../db/index.js';
import { eq, desc, and } from 'drizzle-orm';
import { sessionAuth } from '../middleware/sessionAuth.js';

const router = Router();

// UUID 형식 검증 정규식
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 모든 로그 라우트에 세션 인증 적용
router.use(sessionAuth);

// GET /api/servers/:id/logs — 로그 조회 (레벨 필터, 페이지네이션)
router.get('/:id/logs', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;

    // UUID 형식 검증
    if (!UUID_REGEX.test(id)) {
      res.status(400).json({ error: '유효하지 않은 서버 ID 형식입니다.' });
      return;
    }

    const level = req.query['level'] as string | undefined;

    // limit 파라미터: NaN이면 기본값 100, 상한선 1000
    const rawLimit = parseInt(req.query['limit'] as string ?? '100', 10);
    const limit = isNaN(rawLimit) ? 100 : Math.min(rawLimit, 1000);

    // offset 파라미터: NaN이면 0, 음수면 0
    const rawOffset = parseInt(req.query['offset'] as string ?? '0', 10);
    const offset = isNaN(rawOffset) || rawOffset < 0 ? 0 : rawOffset;

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
