import { Router, Request, Response, NextFunction } from 'express';
import { getDb, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { generateApiKey } from '../lib/apiKey.js';

const router = Router();

// GET /api/servers — 서버 목록 조회
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

    res.json({ servers: serverList });
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
