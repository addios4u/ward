import { Request, Response, NextFunction } from 'express';
import { getDb, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';

// 에이전트 인증 미들웨어 (API Key 방식)
export async function agentAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers['authorization'];

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: '인증 헤더가 없습니다.' });
    return;
  }

  const apiKey = authHeader.slice(7);

  try {
    const db = getDb();
    const [server] = await db
      .select()
      .from(schema.servers)
      .where(eq(schema.servers.apiKey, apiKey))
      .limit(1);

    if (!server) {
      res.status(401).json({ error: '유효하지 않은 API 키입니다.' });
      return;
    }

    // 서버 정보를 req에 첨부
    (req as Request & { server: typeof server }).server = server;
    next();
  } catch (err) {
    next(err);
  }
}
