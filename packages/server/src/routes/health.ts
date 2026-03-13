import { Router, Request, Response } from 'express';

const router: Router = Router();

// GET /health — 헬스체크
router.get('/', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'ward-server',
  });
});

export default router;
