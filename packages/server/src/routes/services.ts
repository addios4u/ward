import { Router, Request, Response, NextFunction } from 'express';
import { getDb, schema } from '../db/index.js';
import { eq, desc, and } from 'drizzle-orm';
import { sessionAuth } from '../middleware/sessionAuth.js';

const router: Router = Router();
router.use(sessionAuth);

// GET /api/services — 모든 서버의 등록 서비스 목록 (flat)
router.get('/', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const db = getDb();

    const rows = await db
      .select({
        id: schema.services.id,
        serverId: schema.services.serverId,
        serverName: schema.servers.name,
        serverHostname: schema.servers.hostname,
        serverStatus: schema.servers.status,
        name: schema.services.name,
        type: schema.services.type,
        config: schema.services.config,
        status: schema.services.status,
        pid: schema.services.pid,
        restartCount: schema.services.restartCount,
        startedAt: schema.services.startedAt,
        updatedAt: schema.services.updatedAt,
        cpuUsage: schema.services.cpuUsage,
        memUsage: schema.services.memUsage,
      })
      .from(schema.services)
      .innerJoin(schema.servers, eq(schema.services.serverId, schema.servers.id))
      .orderBy(schema.servers.name, schema.services.name);

    res.json({
      services: rows.map(svc => ({
        ...svc,
        startedAt: svc.startedAt?.toISOString() ?? null,
        updatedAt: svc.updatedAt.toISOString(),
        cpuUsage: svc.cpuUsage ?? null,
        memUsage: svc.memUsage ?? null,
      })),
    });
  } catch (err) {
    next(err);
  }
});

export default router;

// /api/servers/:id/services 라우터 (app.ts에서 /api/servers에 마운트)
export const serverServicesRouter: Router = Router();
serverServicesRouter.use(sessionAuth);

// GET /api/servers/:id/processes — 특정 서버의 최신 프로세스 목록
serverServicesRouter.get('/:id/processes', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const db = getDb();

    // 서버 존재 확인
    const [server] = await db
      .select({ id: schema.servers.id })
      .from(schema.servers)
      .where(eq(schema.servers.id, id))
      .limit(1);

    if (!server) {
      res.status(404).json({ error: '서버를 찾을 수 없습니다.' });
      return;
    }

    // 최신 collectedAt 조회
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

    // 해당 collectedAt의 프로세스 목록 조회
    const processes = await db
      .select()
      .from(schema.processes)
      .where(
        and(
          eq(schema.processes.serverId, id),
          eq(schema.processes.collectedAt, latest.collectedAt)
        )
      )
      .limit(10000);

    res.json({
      processes: processes.map((p) => ({
        id: p.id,
        serverId: p.serverId,
        pid: p.pid,
        name: p.name,
        cpuUsage: p.cpuUsage,
        memUsage: p.memUsage,
        status: p.status ?? 'unknown',
        collectedAt: p.collectedAt,
      })),
      collectedAt: latest.collectedAt,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/servers/:id/services
serverServicesRouter.get('/:id/services', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const db = getDb();

    const [server] = await db
      .select({
        id: schema.servers.id,
        name: schema.servers.name,
        hostname: schema.servers.hostname,
        status: schema.servers.status,
      })
      .from(schema.servers)
      .where(eq(schema.servers.id, id))
      .limit(1);

    if (!server) {
      res.status(404).json({ error: '서버를 찾을 수 없습니다.' });
      return;
    }

    const rows = await db
      .select()
      .from(schema.services)
      .where(eq(schema.services.serverId, id))
      .orderBy(schema.services.name);

    res.json({
      services: rows.map(svc => ({
        id: svc.id,
        serverId: svc.serverId,
        serverName: server.name,
        serverHostname: server.hostname,
        serverStatus: server.status,
        name: svc.name,
        type: svc.type,
        config: svc.config,
        status: svc.status,
        pid: svc.pid,
        restartCount: svc.restartCount,
        startedAt: svc.startedAt?.toISOString() ?? null,
        updatedAt: svc.updatedAt.toISOString(),
        cpuUsage: svc.cpuUsage ?? null,
        memUsage: svc.memUsage ?? null,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/servers/:id/services/:name/restart
serverServicesRouter.post('/:id/services/:name/restart', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id, name } = req.params as { id: string; name: string };
    const db = getDb();

    const [server] = await db.select({ id: schema.servers.id })
      .from(schema.servers).where(eq(schema.servers.id, id)).limit(1);
    if (!server) { res.status(404).json({ error: '서버를 찾을 수 없습니다.' }); return; }

    const [service] = await db.select({ name: schema.services.name })
      .from(schema.services)
      .where(and(eq(schema.services.serverId, id), eq(schema.services.name, name)))
      .limit(1);
    if (!service) { res.status(404).json({ error: '서비스를 찾을 수 없습니다.' }); return; }

    await db.insert(schema.pendingCommands).values({
      serverId: id,
      serviceName: name,
      action: 'restart',
    });

    res.json({ ok: true });
  } catch (err) { next(err); }
});

// DELETE /api/servers/:id/services/:name
serverServicesRouter.delete('/:id/services/:name', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id, name } = req.params as { id: string; name: string };
    const db = getDb();

    const [deleted] = await db
      .delete(schema.services)
      .where(and(eq(schema.services.serverId, id), eq(schema.services.name, name)))
      .returning({ id: schema.services.id });

    if (!deleted) {
      res.status(404).json({ error: '서비스를 찾을 수 없습니다.' });
      return;
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// GET /api/servers/:id/services/:name/logs
serverServicesRouter.get('/:id/services/:name/logs', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id, name } = req.params as { id: string; name: string };
    const limit = Math.min(parseInt(String(req.query['limit'] ?? '100'), 10), 1000);
    const offset = parseInt(String(req.query['offset'] ?? '0'), 10);
    const level = req.query['level'] as string | undefined;

    const db = getDb();

    const conditions = [
      eq(schema.logs.serverId, id),
      eq(schema.logs.source, name),
      ...(level ? [eq(schema.logs.level, level)] : []),
    ];

    const logs = await db
      .select()
      .from(schema.logs)
      .where(and(...conditions))
      .orderBy(desc(schema.logs.loggedAt))
      .limit(limit)
      .offset(offset);

    res.json({
      logs: logs.map(l => ({
        id: l.id,
        serverId: l.serverId,
        source: l.source,
        level: l.level,
        message: l.message,
        loggedAt: l.loggedAt.toISOString(),
        createdAt: l.createdAt.toISOString(),
      })),
      limit,
      offset,
    });
  } catch (err) {
    next(err);
  }
});
