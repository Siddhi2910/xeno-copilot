import { Router, Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { Customer, RFM_SEGMENTS } from '../models/Customer';
import { CommunicationEvent } from '../models/CommunicationEvent';
import { AppError } from '../middleware/errorHandler';
import { decodeCursor, buildPaginationMeta } from '../lib/pagination';
import { OptOutSchema } from '../lib/validation';

const router = Router();

// ─── GET /api/v1/customers ────────────────────────────────────────────────────

router.get(
  '/',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const limit       = Math.min(parseInt(String(req.query.limit ?? '20'), 10) || 20, 200);
      const cursor      = req.query.cursor as string | undefined;
      const rfmSegment  = req.query.rfmSegment as string | undefined;
      const tag         = req.query.tag as string | undefined;
      const channel     = req.query.channel as string | undefined;
      const search      = req.query.search as string | undefined;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const filter: Record<string, any> = {};

      if (rfmSegment) filter.rfmSegment = rfmSegment;
      if (tag)        filter.tags = tag;
      if (channel)    filter.optOutChannels = { $nin: [channel] };

      if (search) {
        const escaped = search.slice(0, 50).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        filter.$or = [
          { name:  { $regex: `^${escaped}`, $options: 'i' } },
          { phone: { $regex: escaped,        $options: 'i' } },
        ];
      }

      if (cursor) {
        try {
          const lastId = decodeCursor(cursor);
          filter._id = { $gt: new Types.ObjectId(lastId) };
        } catch {
          throw new AppError(400, 'VALIDATION_ERROR', 'Invalid pagination cursor.', 'cursor');
        }
      }

      const [customers, total] = await Promise.all([
        Customer.find(filter).sort({ _id: 1 }).limit(limit).lean(),
        Customer.estimatedDocumentCount(),
      ]);

      const ids = customers.map((c) => c._id.toString());

      res.json({
        data:       customers,
        pagination: buildPaginationMeta(ids, limit, total),
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /api/v1/customers/:customerId ───────────────────────────────────────

router.get(
  '/:customerId',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { customerId } = req.params;
      if (!Types.ObjectId.isValid(customerId)) {
        throw new AppError(404, 'NOT_FOUND', `Customer ${customerId} not found.`);
      }

      const customer = await Customer.findById(customerId).lean();
      if (!customer) {
        throw new AppError(404, 'NOT_FOUND', `Customer ${customerId} not found.`);
      }

      res.json({ data: customer });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /api/v1/customers/:customerId/communications ────────────────────────

router.get(
  '/:customerId/communications',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { customerId } = req.params;
      if (!Types.ObjectId.isValid(customerId)) {
        throw new AppError(404, 'NOT_FOUND', `Customer ${customerId} not found.`);
      }

      const limit      = Math.min(parseInt(String(req.query.limit ?? '20'), 10) || 20, 100);
      const cursor     = req.query.cursor as string | undefined;
      const campaignId = req.query.campaignId as string | undefined;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const filter: Record<string, any> = { customerId: new Types.ObjectId(customerId) };
      if (campaignId && Types.ObjectId.isValid(campaignId)) {
        filter.campaignId = new Types.ObjectId(campaignId);
      }
      if (cursor) {
        try {
          const lastId = decodeCursor(cursor);
          filter._id = { $lt: new Types.ObjectId(lastId) };
        } catch {
          throw new AppError(400, 'VALIDATION_ERROR', 'Invalid pagination cursor.', 'cursor');
        }
      }

      // Sort by _id descending so the $lt cursor stays aligned with sort order.
      // _id embeds creation time, which matches eventTimestamp ordering for practical purposes.
      const events = await CommunicationEvent.find(filter)
        .sort({ _id: -1 })
        .limit(limit)
        .lean();

      // Count uses the same filter (including campaignId if present) so total is accurate.
      const total = await CommunicationEvent.countDocuments(filter);
      const ids   = events.map((e) => e._id.toString());

      res.json({
        data: events.map((e) => ({
          _id:            e._id.toString(),
          messageId:      e.messageId.toString(),
          campaignId:     e.campaignId.toString(),
          channel:        e.channel,
          eventType:      e.eventType,
          eventTimestamp: e.eventTimestamp,
        })),
        pagination: buildPaginationMeta(ids, limit, total),
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── PATCH /api/v1/customers/:customerId/opt-out ─────────────────────────────

router.patch(
  '/:customerId/opt-out',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { customerId } = req.params;
      if (!Types.ObjectId.isValid(customerId)) {
        throw new AppError(404, 'NOT_FOUND', `Customer ${customerId} not found.`);
      }

      const parseResult = OptOutSchema.safeParse(req.body);
      if (!parseResult.success) {
        const issue = parseResult.error.issues[0];
        throw new AppError(400, 'VALIDATION_ERROR', issue.message, issue.path[0]?.toString());
      }

      const { channel, optedOut } = parseResult.data;

      const update = optedOut
        ? { $addToSet: { optOutChannels: channel }, $set: { updatedAt: new Date() } }
        : { $pull: { optOutChannels: channel }, $set: { updatedAt: new Date() } };

      const customer = await Customer.findByIdAndUpdate(customerId, update, { new: true }).lean();
      if (!customer) {
        throw new AppError(404, 'NOT_FOUND', `Customer ${customerId} not found.`);
      }

      res.json({
        data: {
          _id:             customer._id.toString(),
          optOutChannels:  customer.optOutChannels,
          updatedAt:       customer.updatedAt,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
