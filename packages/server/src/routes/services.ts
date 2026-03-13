import { Router, Request, Response, NextFunction } from 'express';
import { getDb, schema } from '../db/index.js';
import { eq, desc, and, isNotNull, max, count } from 'drizzle-orm';
import { sessionAuth } from '../middleware/sessionAuth.js';

const router: Router = Router();

// 모든 서비스 라우트에 세션 인증 적용
router.use(sessionAuth);

// GET /api/services — Ward 에이전트가 모니터링 중인 서비스(로그 소스) 목록
router.get('/', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const db = getDb();

    // 서버 목록 조회
    const serverList = await db
      .select({
        id: schema.servers.id,
        name: schema.servers.name,
        hostname: schema.servers.hostname,
        status: schema.servers.status,
      })
      .from(schema.servers)
      .orderBy(schema.servers.createdAt);

    // 각 서버별 로그 소스(서비스) 집계
    const services = await Promise.all(
      serverList.map(async (server) => {
        const logSources = await db
          .select({
            source: schema.logs.source,
            lastLoggedAt: max(schema.logs.loggedAt),
            logCount: count(schema.logs.id),
          })
          .from(schema.logs)
          .where(
            and(
              eq(schema.logs.serverId, server.id),
              isNotNull(schema.logs.source),
            )
          )
          .groupBy(schema.logs.source)
          .orderBy(desc(max(schema.logs.loggedAt)));

        return {
          serverId: server.id,
          serverName: server.name,
          serverHostname: server.hostname,
          serverStatus: server.status,
          services: logSources.map((s) => ({
            source: s.source!,
            lastLoggedAt: s.lastLoggedAt?.toISOString() ?? null,
            logCount: Number(s.logCount),
          })),
        };
      })
    );

    res.json({ services });
  } catch (err) {
    next(err);
  }
});

// GET /api/servers/:id/processes — 특정 서버의 최신 프로세스 목록 반환
// 이 라우터는 /api/servers 에 마운트되므로 경로는 /:id/processes
export const processesRouter: Router = Router();
processesRouter.use(sessionAuth);

processesRouter.get('/:id/processes', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params['id'] as string;
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

    // 가장 최근 collectedAt 조회
    const [latest] = await db
      .select({ collectedAt: schema.processes.collectedAt })
      .from(schema.processes)
      .where(eq(schema.processes.serverId, id))
      .orderBy(desc(schema.processes.collectedAt))
      .limit(1);

    if (!latest) {
      res.json({ processes: [], collectedAt: null });
      return;
    }

    // 해당 서버의 최신 시점 프로세스 목록 조회
    const processList = await db
      .select()
      .from(schema.processes)
      .where(
        and(
          eq(schema.processes.serverId, id),
          eq(schema.processes.collectedAt, latest.collectedAt),
        )
      )
      .limit(1000);

    res.json({ processes: processList, collectedAt: latest.collectedAt });
  } catch (err) {
    next(err);
  }
});

export default router;
