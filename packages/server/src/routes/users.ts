import { Router, Request, Response, NextFunction } from 'express';
import { getDb, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import { sessionAuth } from '../middleware/sessionAuth.js';

const router: Router = Router();

// 모든 사용자 관리 API에 세션 인증 적용
router.use(sessionAuth);

// GET /api/users — 사용자 목록 (passwordHash 제외)
router.get('/', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const db = getDb();

    const userList = await db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        createdAt: schema.users.createdAt,
      })
      .from(schema.users)
      .orderBy(schema.users.createdAt);

    res.json({ users: userList });
  } catch (err) {
    next(err);
  }
});

// POST /api/users — 새 사용자 추가
router.post('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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

    // 이메일 중복 확인
    const [existing] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, email.trim()))
      .limit(1);

    if (existing) {
      res.status(409).json({ error: '이미 사용 중인 이메일입니다.' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const [newUser] = await db
      .insert(schema.users)
      .values({
        email: email.trim(),
        passwordHash,
      })
      .returning({
        id: schema.users.id,
        email: schema.users.email,
        createdAt: schema.users.createdAt,
      });

    res.status(201).json({ user: newUser });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/users/:id — 사용자 삭제
router.delete('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params['id'] as string;
    const db = getDb();

    // 전체 사용자 수 확인 (최소 1명 유지)
    const allUsers = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .limit(100);

    if (allUsers.length <= 1) {
      res.status(400).json({ error: '마지막 사용자는 삭제할 수 없습니다.' });
      return;
    }

    const [deleted] = await db
      .delete(schema.users)
      .where(eq(schema.users.id, id))
      .returning({ id: schema.users.id });

    if (!deleted) {
      res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
      return;
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// PATCH /api/users/:id/password — 비밀번호 변경
router.patch('/:id/password', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params['id'] as string;
    const { password } = req.body as { password?: string };

    if (!password || typeof password !== 'string' || password.trim() === '') {
      res.status(400).json({ error: 'password는 필수입니다.' });
      return;
    }

    const db = getDb();

    // 사용자 존재 여부 확인
    const [user] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.id, id))
      .limit(1);

    if (!user) {
      res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await db
      .update(schema.users)
      .set({ passwordHash })
      .where(eq(schema.users.id, id))
      .returning({ id: schema.users.id });

    res.json({ message: '비밀번호가 변경되었습니다.' });
  } catch (err) {
    next(err);
  }
});

export default router;
