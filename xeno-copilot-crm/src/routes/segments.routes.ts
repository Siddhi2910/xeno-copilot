import { Router, Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { Customer, RFM_SEGMENTS } from '../models/Customer';
import { AppError } from '../middleware/errorHandler';
import { decodeCursor, buildPaginationMeta } from '../lib/pagination';

const router = Router();

const VALID_SEGMENTS = new Set(RFM_SEGMENTS as unknown as string[]);

// ─── GET /api/v1/segments ─────────────────────────────────────────────────────
// Aggregates per-segment stats from the customers collection.

router.get(
  '/',
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const now = new Date();

      interface SegmentAgg {
        _id: string;
        count: number;
        avgSpend: number;
        avgOrderFrequency: number;
        avgLastOrderMs: number;   // avg of lastOrderAt.getTime()
      }

      const agg = await Customer.aggregate<SegmentAgg>([
        { $match: { rfmSegment: { $ne: null } } },
        {
          $group: {
            _id:               '$rfmSegment',
            count:             { $sum: 1 },
            avgSpend:          { $avg: '$totalSpend' },
            avgOrderFrequency: { $avg: '$totalOrders' },
            avgLastOrderMs:    { $avg: { $toLong: '$lastOrderAt' } },
          },
        },
      ]);

      const totalCustomers = await Customer.estimatedDocumentCount();

      const segmentMap = new Map(agg.map((s) => [s._id, s]));
      // Use sum of segmented customers as the denominator so percentages reflect
      // only customers with a computed RFM segment (excludes null-segment customers).
      const segmentedTotal = agg.reduce((sum, s) => sum + s.count, 0);

      const segments = RFM_SEGMENTS.map((seg) => {
        const s = segmentMap.get(seg);
        if (!s) {
          return {
            segment:              seg,
            count:                0,
            percentOfTotal:       0,
            avgSpend:             0,
            avgOrderFrequency:    0,
            avgDaysSinceLastOrder: 0,
          };
        }
        const avgDaysSince = s.avgLastOrderMs
          ? Math.round((now.getTime() - s.avgLastOrderMs) / 86400000)
          : 0;
        return {
          segment:              seg,
          count:                s.count,
          percentOfTotal:       segmentedTotal > 0 ? Math.round((s.count / segmentedTotal) * 1000) / 10 : 0,
          avgSpend:             Math.round(s.avgSpend ?? 0),
          avgOrderFrequency:    Math.round((s.avgOrderFrequency ?? 0) * 10) / 10,
          avgDaysSinceLastOrder: avgDaysSince,
        };
      });

      res.json({
        data: {
          computedAt:     now,
          totalCustomers,
          segments,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /api/v1/segments/:segmentName/customers ──────────────────────────────

router.get(
  '/:segmentName/customers',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { segmentName } = req.params;

      if (!VALID_SEGMENTS.has(segmentName)) {
        throw new AppError(
          404,
          'NOT_FOUND',
          `Segment '${segmentName}' does not exist. Valid segments: ${RFM_SEGMENTS.join(', ')}`
        );
      }

      const limit  = Math.min(parseInt(String(req.query.limit ?? '20'), 10) || 20, 200);
      const cursor = req.query.cursor as string | undefined;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const filter: Record<string, any> = { rfmSegment: segmentName };

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
        Customer.countDocuments({ rfmSegment: segmentName }),
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

export default router;
