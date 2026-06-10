import { Request, Response, NextFunction } from 'express';
import { createHash, timingSafeEqual } from 'crypto';
import { AppError } from './errorHandler';

// Paths that do NOT require a Bearer token.
// /track/click/* is public (redirect URLs sent to customers).
// /api/v1/callbacks/delivery uses HMAC validation instead (handled in callbacks.routes.ts).
const OPEN_PREFIXES = [
  '/health',
  '/api/v1/health',
  '/api/v1/track/click/',
  '/api/v1/callbacks/delivery',
];

function isOpen(path: string): boolean {
  return OPEN_PREFIXES.some((prefix) =>
    prefix.endsWith('/') ? path.startsWith(prefix) : path === prefix
  );
}

// Hash both strings before comparison so timingSafeEqual always receives
// same-length buffers regardless of token length.
function safeEqual(a: string, b: string): boolean {
  try {
    const ha = Buffer.from(createHash('sha256').update(a).digest('hex'), 'utf8');
    const hb = Buffer.from(createHash('sha256').update(b).digest('hex'), 'utf8');
    return timingSafeEqual(ha, hb);
  } catch {
    return false;
  }
}

export function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  if (isOpen(req.path)) return next();

  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return next(
      new AppError(401, 'UNAUTHORIZED', 'Missing or malformed Authorization header.')
    );
  }

  const token = header.slice(7);
  const expected = process.env.API_SECRET_TOKEN;

  if (!expected) {
    console.error('[auth] API_SECRET_TOKEN is not set — rejecting all requests');
    return next(new AppError(500, 'INTERNAL_ERROR', 'Server misconfiguration.'));
  }

  if (!safeEqual(token, expected)) {
    return next(new AppError(401, 'UNAUTHORIZED', 'Invalid token.'));
  }

  next();
}
