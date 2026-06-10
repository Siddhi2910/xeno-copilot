/**
 * ai.routes.ts
 *
 * AI pipeline endpoints — the 5-call Gemini pipeline (Calls 1–4 here).
 * Call 5 (post-campaign report) is invoked by the background job.
 *
 * POST /api/v1/ai/intent-extract       — Call 1: classify goal → intent
 * POST /api/v1/ai/audience-preview     — Calls 2+3 (parallel): narrative + messages (no DB save)
 * POST /api/v1/ai/generate-campaign    — Calls 2+3 + save Campaign DRAFT + CampaignClusters
 * POST /api/v1/ai/refine-campaign      — Call 4: deterministic rules + AI tone review
 *
 * All responses follow API_SPEC.md §3 envelope format: { data: ... } or { error: ... }.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { AppError } from '../middleware/errorHandler';
import { Campaign } from '../models/Campaign';
import { CampaignCluster } from '../models/CampaignCluster';
import {
  IntentExtractSchema,
  AudiencePreviewSchema,
  CampaignRefineSchema,
} from '../lib/validation';
import {
  buildAudienceFilter,
  queryAudienceStats,
  computeRevenueEstimate,
  INTENT_TO_GOAL_TYPE,
  INTENT_TYPE_SET,
  type IntentType,
} from '../services/audience.service';
import { extractIntent }              from '../services/ai/intentExtraction.service';
import { generateAudienceNarrative }  from '../services/ai/audienceNarrative.service';
import { generateMessages }           from '../services/ai/messageGeneration.service';
import { critiqueCampaign }           from '../services/ai/campaignCritique.service';

const router = Router();

// ─── POST /api/v1/ai/intent-extract ───────────────────────────────────────────
// Call 1 — classify the marketer's goal into a structured intent type.

router.post(
  '/intent-extract',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = IntentExtractSchema.safeParse(req.body);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        throw new AppError(400, 'VALIDATION_ERROR', issue.message, issue.path[0]?.toString());
      }
      const { goalText } = parsed.data;

      const result = await extractIntent(
        goalText,
        process.env.DEMO_BRAND_NAME  ?? 'Your Brand',
        process.env.DEMO_INDUSTRY    ?? 'retail',
        0,   // totalCustomers — populated from DB in a production implementation
        null,
      );

      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /api/v1/ai/audience-preview ─────────────────────────────────────────
// Calls 2+3 in parallel — returns audience narrative + messages. No DB write.

router.post(
  '/audience-preview',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = AudiencePreviewSchema.safeParse(req.body);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        throw new AppError(400, 'VALIDATION_ERROR', issue.message, issue.path[0]?.toString());
      }
      const { goalText, intentType, intentParameters } = parsed.data;

      // Deterministic audience query (no LLM)
      const filter   = await buildAudienceFilter(intentType, intentParameters);
      const audience = await queryAudienceStats(filter);
      const goalType = INTENT_TO_GOAL_TYPE[intentType];

      // Parallel Calls 2+3
      const [narrative, messages] = await Promise.all([
        generateAudienceNarrative({ goalText, audience, goalType }),
        generateMessages({
          goalText,
          clusters: audience.clusters.length > 0
            ? audience.clusters.map((c) => ({
                label:              c.rfmSegment,
                count:              c.count,
                rfmSegment:         c.rfmSegment,
                avgSpend:           c.avgSpend,
                reachability:       '',
                toneRecommendation: '',
                persona:            null,
              }))
            : [],
        }),
      ]);

      const revenueEstimate = await computeRevenueEstimate(
        audience.count, goalType, audience.medianAOV, audience.channelMix,
      );

      res.json({
        data: {
          audience:        { ...audience, narrative: narrative.narrative, narrativeValid: narrative.narrativeValid },
          clusterCards:    narrative.clusterCards,
          clusters:        messages.clusters,
          messageWarnings: messages.warnings,
          revenueEstimate,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /api/v1/ai/generate-campaign ────────────────────────────────────────
// Full pipeline: audience query + Calls 2+3 in parallel → save Campaign DRAFT +
// CampaignCluster documents. Returns campaignId.

router.post(
  '/generate-campaign',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { name, goalText, intentType, intentParameters } = req.body;

      // Validation
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        throw new AppError(400, 'VALIDATION_ERROR', 'name is required.', 'name');
      }
      if (name.trim().length > 200) {
        throw new AppError(400, 'VALIDATION_ERROR', 'name must be ≤ 200 characters.', 'name');
      }
      if (!goalText || typeof goalText !== 'string' || goalText.trim().length < 10) {
        throw new AppError(400, 'VALIDATION_ERROR', 'goalText must be at least 10 characters.', 'goalText');
      }
      if (!intentType || !INTENT_TYPE_SET.has(String(intentType))) {
        throw new AppError(400, 'VALIDATION_ERROR', `intentType must be one of: ${[...INTENT_TYPE_SET].join(', ')}.`, 'intentType');
      }
      if (!intentParameters || typeof intentParameters !== 'object' || Array.isArray(intentParameters)) {
        throw new AppError(400, 'VALIDATION_ERROR', 'intentParameters must be an object.', 'intentParameters');
      }

      // Deterministic audience query
      const safeIntentType = String(intentType) as IntentType;
      const filter   = await buildAudienceFilter(safeIntentType, intentParameters as Record<string, unknown>);
      const audience = await queryAudienceStats(filter);
      const goalType = INTENT_TO_GOAL_TYPE[safeIntentType];

      // Create Campaign stub to get campaignId before AI calls
      const campaign = await Campaign.create({
        name:             name.trim(),
        goalText:         goalText.trim(),
        goalType,
        intentType:       goalType,
        intentParameters: {
          dormancyDays:       (intentParameters as Record<string,unknown>).dormancyDays   ?? null,
          minOrders:          (intentParameters as Record<string,unknown>).minOrderCount  ?? null,
          maxOrders:          null,
          minSpend:           (intentParameters as Record<string,unknown>).minTotalSpend  ?? null,
          productCategory:    (intentParameters as Record<string,unknown>).category       ?? null,
          acquisitionChannel: null,
        },
        audienceFilter:   filter,
        status:           'DRAFT',
      });
      const campaignId = campaign._id;

      // Parallel Calls 2+3, passing campaignId for AiLog association
      const narrativeClusters = audience.clusters.map((c) => ({
        label:              c.rfmSegment,
        count:              c.count,
        rfmSegment:         c.rfmSegment,
        avgSpend:           c.avgSpend,
        reachability:       '',
        toneRecommendation: '',
        persona:            null,
      }));

      const [narrative, messages] = await Promise.all([
        generateAudienceNarrative({ goalText, audience, goalType, campaignId }),
        generateMessages({ goalText, clusters: narrativeClusters, campaignId }),
      ]);

      const revenueEstimate = await computeRevenueEstimate(
        audience.count, goalType, audience.medianAOV, audience.channelMix,
      );

      // Pick primary channel per cluster (most reachable)
      function primaryChannel(channels: Record<string, number>): string {
        const sorted = Object.entries(channels).sort(([, a], [, b]) => b - a);
        return sorted[0]?.[0] ?? 'EMAIL';
      }

      // Save CampaignCluster documents
      const clusterDocs = messages.clusters.map((c, i) => {
        const audienceCluster = audience.clusters[i];
        const channels        = audienceCluster?.channels ?? {};
        const assignedCh      = primaryChannel(channels) as 'WHATSAPP' | 'EMAIL' | 'SMS';
        return {
          campaignId,
          clusterLabel:       c.label,
          clusterDescription: narrative.clusterCards[i]?.toneRecommendation ?? null,
          rfmPatternDescription: narrative.clusterCards[i]?.reachability ?? null,
          memberCount:        audienceCluster?.count ?? 0,
          assignedChannel:    assignedCh,
          channelConfidence:  'MEDIUM' as const,
          message: {
            subject:   assignedCh === 'EMAIL' ? c.emailMessage.subject : null,
            body:      assignedCh === 'EMAIL' ? c.emailMessage.body    : c.whatsappMessage.body,
            ctaText:   null,
            ctaUrl:    assignedCh === 'EMAIL' ? c.emailMessage.ctaUrl  : c.whatsappMessage.ctaUrl,
            rationale: null,
          },
        };
      });

      if (clusterDocs.length > 0) {
        await CampaignCluster.insertMany(clusterDocs);
      }

      // Update campaign with snapshot + revenue estimate
      await Campaign.updateOne(
        { _id: campaignId },
        {
          $set: {
            audienceSnapshot: {
              count:      audience.count,
              medianAOV:  audience.medianAOV,
              channelMix: audience.channelMix,
              savedAt:    new Date(),
            },
            totalRecipients: audience.count,
            revenueEstimate,
            draftSavedAt:    new Date(),
          },
        },
      );

      res.status(201).json({
        data: {
          campaignId:      campaignId.toHexString(),
          status:          'DRAFT',
          audience:        { ...audience, narrative: narrative.narrative, narrativeValid: narrative.narrativeValid },
          clusterCards:    narrative.clusterCards,
          clusters:        messages.clusters,
          messageWarnings: messages.warnings,
          revenueEstimate,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /api/v1/ai/refine-campaign ─────────────────────────────────────────
// Call 4 — deterministic rules + AI tone review on existing cluster messages.
// Updates CampaignCluster documents in-place if critique is applied.

router.post(
  '/refine-campaign',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { campaignId } = req.body;
      if (!campaignId || !Types.ObjectId.isValid(String(campaignId))) {
        throw new AppError(400, 'VALIDATION_ERROR', 'campaignId must be a valid ObjectId.', 'campaignId');
      }

      const parsedFeedback = CampaignRefineSchema.safeParse(req.body);
      if (!parsedFeedback.success) {
        const issue = parsedFeedback.error.issues[0];
        throw new AppError(400, 'VALIDATION_ERROR', issue.message, issue.path[0]?.toString());
      }
      const { userFeedback } = parsedFeedback.data;

      // Load campaign
      const campaign = await Campaign.findById(campaignId).lean();
      if (!campaign) {
        throw new AppError(404, 'NOT_FOUND', `Campaign ${campaignId} not found.`);
      }
      if (campaign.status !== 'DRAFT') {
        throw new AppError(
          422,
          'INVALID_TRANSITION',
          `Campaign must be in DRAFT status to refine messages. Current status: ${campaign.status}.`,
        );
      }

      // Load cluster messages
      const clusterDocs = await CampaignCluster.find({ campaignId: new Types.ObjectId(String(campaignId)) }).lean();
      if (clusterDocs.length === 0) {
        throw new AppError(422, 'UNPROCESSABLE', 'Campaign has no generated messages to refine. Run generate-campaign first.');
      }

      // Build ClusterMessages shape for critique service
      const clusters = clusterDocs.map((doc) => ({
        label: doc.clusterLabel,
        whatsappMessage: {
          body:           doc.assignedChannel !== 'EMAIL' ? doc.message.body : '',
          characterCount: (doc.assignedChannel !== 'EMAIL' ? doc.message.body : '').length,
          ctaUrl:         doc.message.ctaUrl ?? '',
          subject:        null as null,
        },
        emailMessage: {
          subject:  doc.assignedChannel === 'EMAIL' ? (doc.message.subject ?? '') : '',
          preheader: '',
          body:      doc.assignedChannel === 'EMAIL' ? doc.message.body : '',
          ctaUrl:    doc.message.ctaUrl ?? '',
        },
      }));

      const result = await critiqueCampaign({
        goalText:     campaign.goalText,
        clusters,
        userFeedback: userFeedback ?? null,
        campaignId:   new Types.ObjectId(String(campaignId)),
      });

      // Persist refined messages back to CampaignCluster documents
      if (result.critiqueApplied) {
        for (const doc of clusterDocs) {
          const refined = result.refinedMessages[doc.clusterLabel];
          if (!refined) continue;
          const isEmail = doc.assignedChannel === 'EMAIL';
          await CampaignCluster.updateOne(
            { _id: doc._id },
            {
              $set: {
                'message.body':    isEmail ? refined.emailMessage.body    : refined.whatsappMessage.body,
                'message.subject': isEmail ? refined.emailMessage.subject : null,
              },
            },
          );
        }
      }

      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
