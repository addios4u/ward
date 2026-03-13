import { Router, Request, Response, NextFunction } from 'express';
import { getDb, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import { sessionAuth } from '../middleware/sessionAuth.js';

const router = Router();

// POST /api/auth/login — 이메일/비밀번호 검증 + 세션 발급
router.post('/login', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };

    if (!email || typeof email !== 'string' || email.trim() === '') {
      res.status(400).json({ error: 'email은 필수입니다.' });
      return;
    }

    if (!password || typeof password !== 'string' || password.trim() === '') {
      res.status(400).json({ error: 'password는 필수입니다.' });
      return;
    }

    const db = getDb();
    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email.trim()))
      .limit(1);

    if (!user) {
      res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
      return;
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
      return;
    }

    // 세션에 userId 저장
    req.session.userId = user.id;
    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    res.json({ user: { id: user.id, email: user.email } });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout — 세션 삭제
router.post('/logout', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await new Promise<void>((resolve, reject) => {
      req.session.destroy((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    res.clearCookie('ward.sid');
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me — 현재 세션 사용자 정보 반환
router.get('/me', sessionAuth, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const db = getDb();
    const [user] = await db
      .select({ id: schema.users.id, email: schema.users.email })
      .from(schema.users)
      .where(eq(schema.users.id, req.session.userId!))
      .limit(1);

    if (!user) {
      res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
      return;
    }

    res.json({ user });
  } catch (err) {
    next(err);
  }
});

export default router;
