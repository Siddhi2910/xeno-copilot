import { Request, Response, NextFunction } from 'express';

// ─── Error codes (matches API_SPEC.md §3) ─────────────────────────────────────

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'UNPROCESSABLE'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'AI_UNAVAILABLE'
  | 'INVALID_TRANSITION'
  | 'DUPLICATE_EVENT';

// ─── AppError ─────────────────────────────────────────────────────────────────

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCode;
  public readonly field?: string;
  public readonly details?: unknown[];

  constructor(
    statusCode: number,
    code: ErrorCode,
    message: string,
    field?: string,
    details?: unknown[]
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.field = field;
    this.details = details;
    // Restore prototype chain (required when extending built-in classes)
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

// ─── Express error handler ────────────────────────────────────────────────────
// Must be the last middleware registered (4-argument signature required by Express).

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.field !== undefined ? { field: err.field } : {}),
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
    });
    return;
  }

  // Unexpected error — log the full stack, never expose internals to the client
  console.error('[error]', err);
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.',
    },
  });
}
