import { Request, Response, NextFunction } from 'express';

// 세션 인증 미들웨어
// req.session.userId 존재 여부로 인증 확인
export function sessionAuth(req: Request, res: Response, next: NextFunction): void {
  if (!(req.session as any)?.userId) {
    res.status(401).json({ error: '인증이 필요합니다.' });
    return;
  }
  next();
}
