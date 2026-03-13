import { Router, Request, Response, NextFunction } from 'express';
import { getDb, schema } from '../db/index.js';
import { eq, desc } from 'drizzle-orm';
import { sessionAuth } from '../middleware/sessionAuth.js';

const router = Router();

// 모든 서비스 라우트에 세션 인증 적용
router.use(sessionAuth);

// GET /api/services — 모든 서버의 최신 프로세스 목록 반환
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

    // 각 서버별 최신 프로세스 목록 조회
    const services = await Promise.all(
      serverList.map(async (server) => {
        // 가장 최근 collectedAt 조회
        const [latest] = await db
          .select({ collectedAt: schema.processes.collectedAt })
          .from(schema.processes)
          .where(eq(schema.processes.serverId, server.id))
          .orderBy(desc(schema.processes.collectedAt))
          .limit(1);

        if (!latest) {
          return {
            serverId: server.id,
            serverName: server.name,
            serverHostname: server.hostname,
            serverStatus: server.status,
            processes: [],
          };
        }

        // 해당 서버의 최신 프로세스 목록 조회 (limit으로 체인 종료)
        const processList = await db
          .select()
          .from(schema.processes)
          .where(eq(schema.processes.serverId, server.id))
          .limit(10000);

        return {
          serverId: server.id,
          serverName: server.name,
          serverHostname: server.hostname,
          serverStatus: server.status,
          processes: processList,
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
export const processesRouter = Router();
processesRouter.use(sessionAuth);

processesRouter.get('/:id/processes', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
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

    // 해당 서버의 최신 프로세스 목록 조회 (limit으로 체인 종료)
    const processList = await db
      .select()
      .from(schema.processes)
      .where(eq(schema.processes.serverId, id))
      .limit(10000);

    res.json({ processes: processList, collectedAt: latest.collectedAt });
  } catch (err) {
    next(err);
  }
});

export default router;
