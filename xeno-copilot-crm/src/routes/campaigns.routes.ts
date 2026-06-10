import { Router, Request, Response, NextFunction } from 'express';
import { CAMPAIGN_STATUSES } from '../models/Campaign';
import { INTENT_TYPE_SET } from '../services/audience.service';
import { AppError } from '../middleware/errorHandler';
import { AudiencePreviewSchema } from '../lib/validation';
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

export default router;
