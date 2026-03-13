import { Request, Response, NextFunction } from 'express';
import { getDb, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';

// 서버 식별 미들웨어 (x-ward-server-id 헤더 방식)
export async function serverIdentify(req: Request, res: Response, next: NextFunction): Promise<void> {
  const serverId = req.headers['x-ward-server-id'] as string | undefined;

  if (!serverId) {
    res.status(400).json({ error: 'x-ward-server-id 헤더가 필요합니다.' });
    return;
  }

  try {
    const db = getDb();
    const [server] = await db
      .select()
      .from(schema.servers)
      .where(eq(schema.servers.id, serverId))
      .limit(1);

    if (!server) {
      res.status(404).json({ error: '등록되지 않은 서버입니다.' });
      return;
    }

    // 서버 정보를 req에 첨부
    (req as Request & { server: typeof server }).server = server;
    next();
  } catch (err) {
    next(err);
  }
}
