import { Router, Request, Response, NextFunction } from 'express';
import { getDb, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import { sessionAuth } from '../middleware/sessionAuth.js';
import { LoginGuard } from '../services/LoginGuard.js';
import { CaptchaService } from '../services/CaptchaService.js';

const router: Router = Router();
const loginGuard = new LoginGuard();
const captchaService = new CaptchaService();

// GET /api/auth/captcha — 수학 문제 생성 + 서명된 토큰 반환
router.get('/captcha', (_req: Request, res: Response): void => {
  const { token, question } = captchaService.generate();
  res.json({ token, question });
});

// POST /api/auth/login — 이메일/비밀번호 검증 + 세션 발급
router.post('/login', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, password, captchaToken, captchaAnswer } = req.body as {
      email?: string;
      password?: string;
      captchaToken?: string;
      captchaAnswer?: string;
    };

    if (!email || typeof email !== 'string' || email.trim() === '') {
      res.status(400).json({ error: 'email은 필수입니다.' });
      return;
    }

    if (!password || typeof password !== 'string' || password.trim() === '') {
      res.status(400).json({ error: 'password는 필수입니다.' });
      return;
    }

    // 클라이언트 IP 확인
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      || req.socket.remoteAddress
      || 'unknown';

    // IP 차단 여부 확인
    const blocked = await loginGuard.isBlocked(ip);
    if (blocked) {
      const remainingSeconds = await loginGuard.getBlockRemainingSeconds(ip);
      const remainingMinutes = Math.ceil(remainingSeconds / 60);
      res.status(429).json({
        error: `로그인 시도 횟수 초과로 차단되었습니다. ${remainingMinutes}분 후에 다시 시도하세요.`,
        remainingSeconds,
      });
      return;
    }

    // 실패 횟수 3회 이상이면 CAPTCHA 검증 필요
    const attempts = await loginGuard.getAttempts(ip);
    if (attempts >= 3) {
      if (!captchaToken || !captchaAnswer) {
        res.status(400).json({ error: '보안 captcha 검증이 필요합니다.', requireCaptcha: true });
        return;
      }
      const captchaResult = captchaService.verify(captchaToken, captchaAnswer);
      if (captchaResult !== 'ok') {
        const message = captchaResult === 'expired'
          ? 'captcha가 만료되었습니다. 새로 발급받아 주세요.'
          : 'captcha 답변이 올바르지 않습니다.';
        res.status(400).json({ error: message });
        return;
      }
    }

    const db = getDb();
    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email.trim()))
      .limit(1);

    if (!user) {
      const { attemptsLeft } = await loginGuard.recordFailure(ip);
      const newAttempts = 5 - attemptsLeft;
      res.status(401).json({
        error: '이메일 또는 비밀번호가 올바르지 않습니다.',
        ...(newAttempts >= 3 ? { requireCaptcha: true } : {}),
      });
      return;
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      const { attemptsLeft } = await loginGuard.recordFailure(ip);
      const newAttempts = 5 - attemptsLeft;
      res.status(401).json({
        error: '이메일 또는 비밀번호가 올바르지 않습니다.',
        ...(newAttempts >= 3 ? { requireCaptcha: true } : {}),
      });
      return;
    }

    // 로그인 성공: 실패 기록 초기화
    await loginGuard.recordSuccess(ip);

    // 세션에 userId 저장
    (req.session as any).userId = user.id;
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
      .where(eq(schema.users.id, (req.session as any).userId as string))
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
