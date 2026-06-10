/**
 * campaign.service.ts
 *
 * Business logic for campaign CRUD and statistics.
 * Delegates audience query construction to audience.service.ts.
 *
 * No AI calls are made here — this file covers the deterministic, data-only
 * layer for Phase 5 (core campaign management).
 */

import { Types } from 'mongoose';
import { Campaign, type ICampaign, type CampaignStatus } from '../models/Campaign';
import { CampaignCluster } from '../models/CampaignCluster';
import { AppError } from '../middleware/errorHandler';
import { decodeCursor, buildPaginationMeta } from '../lib/pagination';
import {
  buildAudienceFilter,
  queryAudienceStats,
  computeRevenueEstimate,
  INTENT_TO_GOAL_TYPE,
  type IntentType,
  type IntentParameters,
  type AudienceStats,
} from './audience.service';

// ─── Preview (no DB write) ────────────────────────────────────────────────────

export interface PreviewResult {
  intentType:      IntentType;
  goalType:        string;
  audience:        AudienceStats;
  revenueEstimate: {
    min:            number;
    max:            number;
    conversionRate: number;
    source:         string;
  };
}

export async function previewAudience(
  intentType:  IntentType,
  parameters:  IntentParameters,
): Promise<PreviewResult> {
  const filter    = await buildAudienceFilter(intentType, parameters);
  const audience  = await queryAudienceStats(filter);
  const goalType  = INTENT_TO_GOAL_TYPE[intentType];
  const revenueEstimate = await computeRevenueEstimate(
    audience.count,
    goalType,
    audience.medianAOV,
    audience.channelMix,
  );

  return { intentType, goalType, audience, revenueEstimate };
}

// ─── Create draft campaign ────────────────────────────────────────────────────

export interface CreateCampaignInput {
  name:             string;
  goalText:         string;
  intentType:       IntentType;
  intentParameters: IntentParameters;
}

export async function createDraftCampaign(
  input: CreateCampaignInput,
): Promise<ICampaign> {
  const { name, goalText, intentType, intentParameters } = input;

  const goalType        = INTENT_TO_GOAL_TYPE[intentType];
  const filter          = await buildAudienceFilter(intentType, intentParameters);
  const audience        = await queryAudienceStats(filter);
  const revenueEstimate = await computeRevenueEstimate(
    audience.count,
    goalType,
    audience.medianAOV,
    audience.channelMix,
  );

  // Map IntentParameters → IIntentParameters (Campaign model shape)
  const modelParams = {
    dormancyDays:       typeof intentParameters.dormancyDays === 'number'    ? intentParameters.dormancyDays    : null,
    minOrders:          typeof intentParameters.minOrderCount === 'number'   ? intentParameters.minOrderCount   : null,
    maxOrders:          null,
    minSpend:           typeof intentParameters.minTotalSpend === 'number'   ? intentParameters.minTotalSpend   : null,
    productCategory:    typeof intentParameters.category === 'string'        ? intentParameters.category        : null,
    acquisitionChannel: null,
  };

  const campaign = await Campaign.create({
    name,
    goalText,
    goalType,
    // Campaign.intentType is typed as CampaignType — store the high-level goal type.
    // The original fine-grained intentType (WIN_BACK_DORMANT, etc.) is preserved in
    // audienceFilter so it can be reconstructed if needed.
    intentType:       goalType,
    intentParameters: modelParams,
    audienceFilter:   filter,
    audienceSnapshot: {
      count:      audience.count,
      medianAOV:  audience.medianAOV,
      channelMix: audience.channelMix,
      savedAt:    new Date(),
    },
    totalRecipients:  audience.count,
    revenueEstimate,
    status:           'DRAFT',
    draftSavedAt:     new Date(),
  });

  return campaign.toObject() as unknown as ICampaign;
}

// ─── List campaigns ───────────────────────────────────────────────────────────

export interface ListCampaignsOptions {
  status?: CampaignStatus;
  limit:   number;
  cursor?: string;
}

export interface ListCampaignsResult {
  data:       ICampaign[];
  pagination: { hasMore: boolean; nextCursor: string | null; total: number };
}

export async function listCampaigns(
  opts: ListCampaignsOptions,
): Promise<ListCampaignsResult> {
  const { status, limit, cursor } = opts;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: Record<string, any> = {};
  if (status) filter.status = status;

  if (cursor) {
    try {
      const lastId = decodeCursor(cursor);
      filter._id = { $lt: new Types.ObjectId(lastId) };
    } catch {
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid pagination cursor.', 'cursor');
    }
  }

  // Sort _id descending (newest first). Uses { createdAt: -1 } index equivalent
  // since ObjectId embeds creation time.
  const [campaigns, total] = await Promise.all([
    Campaign.find(filter).sort({ _id: -1 }).limit(limit).lean(),
    Campaign.countDocuments(status ? { status } : {}),
  ]);

  const ids = campaigns.map((c) => c._id.toString());

  return {
    data:       campaigns as unknown as ICampaign[],
    pagination: buildPaginationMeta(ids, limit, total),
  };
}

// ─── Get campaign by ID ───────────────────────────────────────────────────────

export async function getCampaignById(
  id: string,
): Promise<ICampaign> {
  if (!Types.ObjectId.isValid(id)) {
    throw new AppError(404, 'NOT_FOUND', `Campaign ${id} not found.`);
  }
  const campaign = await Campaign.findById(id).lean();
  if (!campaign) {
    throw new AppError(404, 'NOT_FOUND', `Campaign ${id} not found.`);
  }
  return campaign as unknown as ICampaign;
}

// ─── Campaign stats ───────────────────────────────────────────────────────────
// Aggregates from pre-accumulated CampaignCluster.stats (incremented by callback handler).
// Avoids scanning the communication_events collection on every stats request.

export interface CampaignStatsResult {
  campaignId:      string;
  status:          CampaignStatus;
  totalRecipients: number | null;
  stats: {
    queued:    number;
    sent:      number;
    delivered: number;
    failed:    number;
    opened:    number;
    clicked:   number;
    converted: number;
  };
  rates: {
    deliveryRate:   number;  // delivered / sent × 100, 1 dp
    openRate:       number;  // opened / delivered × 100, 1 dp
    clickRate:      number;  // clicked / delivered × 100, 1 dp
    conversionRate: number;  // converted / delivered × 100, 1 dp
  };
}

export async function getCampaignStats(
  id: string,
): Promise<CampaignStatsResult> {
  if (!Types.ObjectId.isValid(id)) {
    throw new AppError(404, 'NOT_FOUND', `Campaign ${id} not found.`);
  }

  const campaign = await Campaign.findById(id, { status: 1, totalRecipients: 1 }).lean();
  if (!campaign) {
    throw new AppError(404, 'NOT_FOUND', `Campaign ${id} not found.`);
  }

  interface StatsAgg {
    queued:    number;
    sent:      number;
    delivered: number;
    failed:    number;
    opened:    number;
    clicked:   number;
    converted: number;
  }

  // Uses { campaignId: 1 } index on campaign_clusters (DATABASE_SCHEMA.md §14).
  const agg = await CampaignCluster.aggregate<StatsAgg>([
    { $match: { campaignId: new Types.ObjectId(id) } },
    {
      $group: {
        _id:       null,
        queued:    { $sum: '$stats.queued'    },
        sent:      { $sum: '$stats.sent'      },
        delivered: { $sum: '$stats.delivered' },
        failed:    { $sum: '$stats.failed'    },
        opened:    { $sum: '$stats.opened'    },
        clicked:   { $sum: '$stats.clicked'   },
        converted: { $sum: '$stats.converted' },
      },
    },
  ]);

  const s: StatsAgg = agg[0] ?? {
    queued: 0, sent: 0, delivered: 0, failed: 0, opened: 0, clicked: 0, converted: 0,
  };

  // Rates — avoid division by zero; return 0 when no data
  const round1dp = (n: number) => Math.round(n * 1000) / 10;
  const deliveryRate   = s.sent      > 0 ? round1dp(s.delivered / s.sent)      : 0;
  const openRate       = s.delivered > 0 ? round1dp(s.opened    / s.delivered) : 0;
  const clickRate      = s.delivered > 0 ? round1dp(s.clicked   / s.delivered) : 0;
  const conversionRate = s.delivered > 0 ? round1dp(s.converted / s.delivered) : 0;

  return {
    campaignId:      id,
    status:          campaign.status,
    totalRecipients: campaign.totalRecipients ?? null,
    stats:           s,
    rates:           { deliveryRate, openRate, clickRate, conversionRate },
  };
}
