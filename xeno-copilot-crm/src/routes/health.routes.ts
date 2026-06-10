import { Router, Request, Response } from 'express';
import { isConnected } from '../config/db';

const router = Router();

// GET /api/v1/health
// No auth required.
// Phase 1: checks MongoDB only.
// Phase 4: will also check Gemini (added when gemini.ts is wired in).
router.get('/health', (_req: Request, res: Response) => {
  const mongoStatus = isConnected() ? 'ok' : 'error';
  const allOk = mongoStatus === 'ok';

  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'ok' : 'degraded',
    checks: {
      mongodb: mongoStatus,
    },
    timestamp: new Date().toISOString(),
  });
});

export default router;
