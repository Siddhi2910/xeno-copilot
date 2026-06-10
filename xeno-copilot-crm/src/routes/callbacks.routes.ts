/**
 * callbacks.routes.ts
 *
 * Inbound callbacks from the Channel Service.
 *
 * POST /api/v1/callbacks/delivery
 *   — No Bearer auth (excluded from authMiddleware in auth.ts)
 *   — Reads raw body from req.rawBody (populated by express.json verify callback in index.ts)
 *   — Validates payload with DeliveryCallbackSchema (zod)
 *   — Delegates to handleDeliveryCallback() for HMAC verification + event processing
 *
 * All responses follow API_SPEC.md §3 envelope: { data: ... } or { error: ... }.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { AppError }               from '../middleware/errorHandler';
import { DeliveryCallbackSchema } from '../lib/validation';
import { handleDeliveryCallback } from '../services/callback.service';

const router = Router();

// ─── POST /api/v1/callbacks/delivery ─────────────────────────────────────────

router.post(
  '/delivery',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Raw body captured by express.json verify in index.ts
      const rawBody = (req as unknown as { rawBody?: string }).rawBody ?? '';

      // Signature header: X-Xeno-Signature: sha256=<hex>
      const signature = (req.headers['x-xeno-signature'] as string | undefined) ?? '';
      if (!signature) {
        throw new AppError(401, 'UNAUTHORIZED', 'Missing X-Xeno-Signature header.');
      }

      // Schema validation
      const parsed = DeliveryCallbackSchema.safeParse(req.body);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        throw new AppError(400, 'VALIDATION_ERROR', issue.message, issue.path[0]?.toString());
      }

      const { messageId, eventType, timestamp, providerId, metadata } = parsed.data;

      // Validate messageId is a valid ObjectId
      if (!Types.ObjectId.isValid(messageId)) {
        throw new AppError(400, 'VALIDATION_ERROR', 'messageId must be a valid 24-char ObjectId.', 'messageId');
      }

      // Validate timestamp is not excessively in the future (60s tolerance)
      const eventTime = new Date(timestamp);
      if (eventTime.getTime() > Date.now() + 60_000) {
        throw new AppError(400, 'VALIDATION_ERROR', 'timestamp must not be more than 60 seconds in the future.', 'timestamp');
      }

      const result = await handleDeliveryCallback(rawBody, signature, {
        messageId,
        eventType,
        timestamp,
        providerId,
        metadata,
      });

      if (!result.accepted) {
        // Idempotent duplicate — return 200 (not an error, just a no-op)
        res.json({ data: { accepted: false, reason: result.reason } });
        return;
      }

      res.status(200).json({ data: { accepted: true, eventId: result.eventId } });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
