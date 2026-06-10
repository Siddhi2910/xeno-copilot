import { Router, Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { CAMPAIGN_STATUSES } from '../models/Campaign';
import { Campaign } from '../models/Campaign';
import { CampaignMessage } from '../models/CampaignMessage';
import { Customer } from '../models/Customer';
import { INTENT_TYPE_SET } from '../services/audience.service';
import { AppError } from '../middleware/errorHandler';
import { AudiencePreviewSchema, CampaignLaunchSchema } from '../lib/validation';
import { encodeCursor, decodeCursor } from '../lib/pagination';
import { launchCampaign } from '../services/dispatch.service';
import {
  previewAudience,
  createDraftCampaign,
  listCampaigns,
  getCampaignById,
  getCampaignStats,
} from '../services/campaign.service';

const router = Router();
const VALID_STATUSES = new Set<string>(CAMPAIGN_STATUSES as unknown as string[]);

// ─── POST /api/v1/campaigns/preview ──────────────────────────────────────────
// Audience preview: no DB write. Validates intent, runs audience query,
// returns count + channel mix + revenue estimate.
// Must be defined before /:campaignId to prevent route shadowing.

router.post(
  '/preview',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = AudiencePreviewSchema.safeParse(req.body);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        throw new AppError(400, 'VALIDATION_ERROR', issue.message, issue.path[0]?.toString());
      }
      const { intentType, intentParameters } = parsed.data;

      const result = await previewAudience(intentType, intentParameters);

      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /api/v1/campaigns ───────────────────────────────────────────────────
// Create campaign in DRAFT status. Runs audience query and saves snapshot.

router.post(
  '/',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { name, goalText, intentType, intentParameters } = req.body;

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        throw new AppError(400, 'VALIDATION_ERROR', 'name is required.', 'name');
      }
      if (name.trim().length > 200) {
        throw new AppError(400, 'VALIDATION_ERROR', 'name must be ≤ 200 characters.', 'name');
      }
      if (!goalText || typeof goalText !== 'string' || goalText.trim().length < 10) {
        throw new AppError(400, 'VALIDATION_ERROR', 'goalText must be at least 10 characters.', 'goalText');
      }
      if (goalText.trim().length > 500) {
        throw new AppError(400, 'VALIDATION_ERROR', 'goalText must be ≤ 500 characters.', 'goalText');
      }
      if (!intentType || !INTENT_TYPE_SET.has(String(intentType))) {
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          `intentType must be one of: ${[...INTENT_TYPE_SET].join(', ')}.`,
          'intentType',
        );
      }
      if (
        !intentParameters ||
        typeof intentParameters !== 'object' ||
        Array.isArray(intentParameters)
      ) {
        throw new AppError(400, 'VALIDATION_ERROR', 'intentParameters must be an object.', 'intentParameters');
      }

      const campaign = await createDraftCampaign({
        name:             name.trim(),
        goalText:         goalText.trim(),
        intentType,
        intentParameters: intentParameters as Record<string, unknown>,
      });

      res.status(201).json({ data: campaign });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /api/v1/campaigns ────────────────────────────────────────────────────
// List campaigns. Sorted newest-first. Supports status filter and cursor pagination.

router.get(
  '/',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const limit  = Math.min(parseInt(String(req.query.limit ?? '20'), 10) || 20, 100);
      const cursor = req.query.cursor as string | undefined;
      const status = req.query.status as string | undefined;

      if (status && !VALID_STATUSES.has(status)) {
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          `status must be one of: ${CAMPAIGN_STATUSES.join(', ')}.`,
          'status',
        );
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await listCampaigns({ status: status as any, limit, cursor });

      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /api/v1/campaigns/:campaignId/stats ─────────────────────────────────
// Must be defined before /:campaignId to prevent "stats" being treated as an id.

router.get(
  '/:campaignId/stats',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { campaignId } = req.params;
      const stats = await getCampaignStats(campaignId);
      res.json({ data: stats });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /api/v1/campaigns/:campaignId ───────────────────────────────────────
// Returns full campaign document including audienceSnapshot, revenueEstimate, aiReport.

router.get(
  '/:campaignId',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { campaignId } = req.params;
      const campaign = await getCampaignById(campaignId);
      res.json({ data: campaign });
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /api/v1/campaigns/:campaignId/ready ─────────────────────────────────
// Transition DRAFT → READY_FOR_REVIEW. Required before launch.

router.post(
  '/:campaignId/ready',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { campaignId } = req.params;
      if (!Types.ObjectId.isValid(campaignId)) {
        throw new AppError(404, 'NOT_FOUND', `Campaign ${campaignId} not found.`);
      }

      const campaign = await Campaign.findOneAndUpdate(
        { _id: new Types.ObjectId(campaignId), status: 'DRAFT' },
        { $set: { status: 'READY_FOR_REVIEW' } },
        { new: true },
      ).lean();

      if (!campaign) {
        const existing = await Campaign.findById(campaignId, { status: 1 }).lean();
        if (!existing) {
          throw new AppError(404, 'NOT_FOUND', `Campaign ${campaignId} not found.`);
        }
        throw new AppError(
          422,
          'INVALID_TRANSITION',
          `Campaign must be in DRAFT status to mark as ready. Current status: ${existing.status}.`,
        );
      }

      res.json({ data: { campaignId, status: 'READY_FOR_REVIEW' } });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /api/v1/campaigns/:campaignId/launch ────────────────────────────────
// Launch a READY_FOR_REVIEW campaign — fan-out to DispatchJob documents.

router.post(
  '/:campaignId/launch',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { campaignId } = req.params;
      if (!Types.ObjectId.isValid(campaignId)) {
        throw new AppError(404, 'NOT_FOUND', `Campaign ${campaignId} not found.`);
      }

      const parsed = CampaignLaunchSchema.safeParse(req.body);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        throw new AppError(400, 'VALIDATION_ERROR', issue.message, issue.path[0]?.toString());
      }

      const scheduledAt = parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : null;

      const result = await launchCampaign(campaignId, scheduledAt);

      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /api/v1/campaigns/:campaignId/messages ───────────────────────────────
// List dispatched messages for a campaign. Cursor pagination, ascending _id order.
// Joins Customer for name + phone.
// Must be defined before /:campaignId.

router.get(
  '/:campaignId/messages',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { campaignId } = req.params;
      if (!Types.ObjectId.isValid(campaignId)) {
        throw new AppError(404, 'NOT_FOUND', `Campaign ${campaignId} not found.`);
      }

      const limit  = Math.min(parseInt(String(req.query.limit ?? '50'), 10) || 50, 200);
      const cursor = req.query.cursor as string | undefined;

      const campaignObjId = new Types.ObjectId(campaignId);

      // Build match stage
      const match: Record<string, unknown> = { campaignId: campaignObjId };
      if (cursor) {
        try {
          match['_id'] = { $gt: new Types.ObjectId(decodeCursor(cursor)) };
        } catch {
          throw new AppError(400, 'VALIDATION_ERROR', 'Invalid cursor.', 'cursor');
        }
      }

      // Aggregate: match → sort asc → limit+1 → lookup customer
      const docs = await CampaignMessage.aggregate([
        { $match: match },
        { $sort: { _id: 1 } },
        { $limit: limit + 1 },
        {
          $lookup: {
            from:         Customer.collection.collectionName,
            localField:   'customerId',
            foreignField: '_id',
            as:           '_customer',
            pipeline:     [{ $project: { name: 1, phone: 1 } }],
          },
        },
        {
          $addFields: {
            customerName:  { $ifNull: [{ $arrayElemAt: ['$_customer.name', 0] }, null] },
            customerPhone: { $ifNull: [{ $arrayElemAt: ['$_customer.phone', 0] }, null] },
          },
        },
        { $project: { _customer: 0 } },
      ]);

      const hasMore = docs.length > limit;
      if (hasMore) docs.pop();

      const nextCursor = hasMore && docs.length > 0
        ? encodeCursor((docs[docs.length - 1]._id as Types.ObjectId).toHexString())
        : null;

      res.json({
        data:       docs,
        pagination: { hasMore, nextCursor },
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
