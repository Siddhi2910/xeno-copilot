import { Router, Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { Order } from '../models/Order';
import { AppError } from '../middleware/errorHandler';
import { decodeCursor, buildPaginationMeta } from '../lib/pagination';

const router = Router();

// ─── GET /api/v1/orders ───────────────────────────────────────────────────────

router.get(
  '/',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const limit      = Math.min(parseInt(String(req.query.limit ?? '20'), 10) || 20, 200);
      const cursor     = req.query.cursor as string | undefined;
      const customerId = req.query.customerId as string | undefined;
      const channel    = req.query.channel as string | undefined;
      const startDate  = req.query.startDate as string | undefined;
      const endDate    = req.query.endDate   as string | undefined;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const filter: Record<string, any> = {};

      if (customerId) {
        if (!Types.ObjectId.isValid(customerId)) {
          throw new AppError(400, 'VALIDATION_ERROR', 'customerId must be a valid ObjectId.', 'customerId');
        }
        filter.customerId = new Types.ObjectId(customerId);
      }

      if (channel) filter.channel = channel.toUpperCase();

      if (startDate || endDate) {
        filter.orderDate = {};
        if (startDate) {
          const d = new Date(startDate);
          if (isNaN(d.getTime())) throw new AppError(400, 'VALIDATION_ERROR', 'startDate is not a valid ISO date.', 'startDate');
          filter.orderDate.$gte = d;
        }
        if (endDate) {
          const d = new Date(endDate);
          if (isNaN(d.getTime())) throw new AppError(400, 'VALIDATION_ERROR', 'endDate is not a valid ISO date.', 'endDate');
          filter.orderDate.$lte = d;
        }
      }

      if (cursor) {
        try {
          const lastId = decodeCursor(cursor);
          filter._id = { $gt: new Types.ObjectId(lastId) };
        } catch {
          throw new AppError(400, 'VALIDATION_ERROR', 'Invalid pagination cursor.', 'cursor');
        }
      }

      const [orders, total] = await Promise.all([
        Order.find(filter).sort({ _id: 1 }).limit(limit).lean(),
        Order.estimatedDocumentCount(),
      ]);

      const ids = orders.map((o) => o._id.toString());

      res.json({
        data:       orders,
        pagination: buildPaginationMeta(ids, limit, total),
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /api/v1/orders/:orderId ──────────────────────────────────────────────
// orderId is the MongoDB _id (hex string), not the orderId field.

router.get(
  '/:orderId',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { orderId } = req.params;
      if (!Types.ObjectId.isValid(orderId)) {
        throw new AppError(404, 'NOT_FOUND', `Order ${orderId} not found.`);
      }

      const order = await Order.findById(orderId).lean();
      if (!order) {
        throw new AppError(404, 'NOT_FOUND', `Order ${orderId} not found.`);
      }

      res.json({ data: order });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
