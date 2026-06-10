/**
 * audience.service.ts
 *
 * Intent whitelist + audience aggregation.
 *
 * Security boundary: The LLM never touches this file.
 * buildAudienceFilter() maps (intentType, parameters) → safe MongoDB query.
 * No MongoDB operators ($where, $expr, etc.) can be injected through parameters
 * because rejectDollarKeys() validates the inputs and the query is constructed
 * deterministically by application code, not from user/LLM strings.
 *
 * See AI_FEATURES.md §2 "Intent Whitelist" and DATABASE_SCHEMA.md §3.
 */

import { Types } from 'mongoose';
import { Customer }     from '../models/Customer';
import { Order }        from '../models/Order';
import { ChannelStats } from '../models/ChannelStats';
import type { CampaignType }    from '../models/ChannelStats';
import type { IRevenueEstimate } from '../models/Campaign';
import { AppError } from '../middleware/errorHandler';

// ─── Intent type registry ─────────────────────────────────────────────────────
// This list is the canonical whitelist. If an intent type is not here, it is
// rejected before any query is executed — it cannot reach MongoDB.

export const INTENT_TYPES = [
  'WIN_BACK_DORMANT',
  'REWARD_TOP_SPENDERS',
  'RE_ENGAGE_SINGLE_PURCHASE',
  'UPSELL_CATEGORY',
  'VIP_LOYALTY',
] as const;

export type IntentType = (typeof INTENT_TYPES)[number];
export const INTENT_TYPE_SET = new Set<string>(INTENT_TYPES as unknown as string[]);

// Map specific intent → high-level CampaignType stored in campaigns.goalType
// (DATABASE_SCHEMA.md §5: goalType uses the CAMPAIGN_TYPES enum)
export const INTENT_TO_GOAL_TYPE: Record<IntentType, CampaignType> = {
  WIN_BACK_DORMANT:          'WIN_BACK',
  REWARD_TOP_SPENDERS:       'REWARD_LOYAL',
  RE_ENGAGE_SINGLE_PURCHASE: 'WIN_BACK',
  UPSELL_CATEGORY:           'UPSELL',
  VIP_LOYALTY:               'REWARD_LOYAL',
};

// Cold-start conversion-rate benchmarks (AI_FEATURES.md §10)
const BENCHMARK_RATES: Partial<Record<CampaignType, number>> = {
  WIN_BACK:     0.05,  // Klaviyo 2024
  REWARD_LOYAL: 0.08,  // Klaviyo 2024
  UPSELL:       0.05,
  CROSS_SELL:   0.05,
  ANNOUNCEMENT: 0.03,
  CUSTOM:       0.04,
};

// ─── Parameter interfaces ─────────────────────────────────────────────────────

export interface IntentParameters {
  dormancyDays?:  number;  // WIN_BACK_DORMANT
  topPercentile?: number;  // REWARD_TOP_SPENDERS
  category?:      string;  // UPSELL_CATEGORY
  minOrderCount?: number;  // VIP_LOYALTY
  minTotalSpend?: number;  // VIP_LOYALTY
  [key: string]:  unknown; // allow unknown keys — rejectDollarKeys validates them
}

// ─── Result shapes ─────────────────────────────────────────────────────────────

export interface ClusterCard {
  label:      string;
  rfmSegment: string;
  count:      number;
  avgSpend:   number;
  channels:   Record<string, number>;
}

export interface AudienceStats {
  count:      number;
  medianAOV:  number;  // approximated as $avg totalSpend (MongoDB 6 lacks $percentile on M0)
  channelMix: Record<string, number>;
  clusters:   ClusterCard[];
  filter:     Record<string, unknown>;
}

// ─── Security: reject MongoDB injection ───────────────────────────────────────
// Recursively reject any key that starts with '$'.
// Called on intentParameters before they influence any query construction.

function rejectDollarKeys(params: Record<string, unknown>, path = 'intentParameters'): void {
  for (const key of Object.keys(params)) {
    if (key.startsWith('$')) {
      throw new AppError(
        422,
        'UNPROCESSABLE',
        `Parameter key '${path}.${key}' must not start with '$'. MongoDB operators are not permitted.`,
        path
      );
    }
    const val = params[key];
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      rejectDollarKeys(val as Record<string, unknown>, `${path}.${key}`);
    }
  }
}

// ─── Whitelist query builder ──────────────────────────────────────────────────
// Only this function may translate intent parameters into MongoDB filters.
// Returns a safe query object ready for Customer.find() / Customer.aggregate($match).

export async function buildAudienceFilter(
  intentType: IntentType,
  parameters: IntentParameters
): Promise<Record<string, unknown>> {
  // Security gate — must be first
  rejectDollarKeys(parameters);

  const now       = new Date();
  const MS_PER_DAY = 86_400_000;

  switch (intentType) {

    // Customers who haven't purchased in N days, segmented as DORMANT or LAPSED.
    // Uses { lastOrderAt, totalOrders } compound index (DATABASE_SCHEMA.md §14).
    case 'WIN_BACK_DORMANT': {
      const days = Number(parameters.dormancyDays ?? 90);
      if (!Number.isInteger(days) || days < 1 || days > 730) {
        throw new AppError(422, 'UNPROCESSABLE', 'dormancyDays must be an integer 1–730.', 'dormancyDays');
      }
      const cutoff = new Date(now.getTime() - days * MS_PER_DAY);
      return {
        rfmSegment: { $in: ['DORMANT_VIPS', 'LAPSED_LOW_VALUE'] },
        lastOrderAt: { $lt: cutoff },
      };
      // Index used: { rfmSegment, lastOrderAt } compound index
    }

    // Top monetary quintile with at least mid-range frequency.
    // Uses { rfmSegment: 1 } index.
    case 'REWARD_TOP_SPENDERS': {
      return {
        rfmM: 5,
        rfmF: { $gte: 3 },
      };
      // Index used: collection scan on rfmM/rfmF (no dedicated index; acceptable for small datasets)
    }

    // Customers with exactly 1 order, dormant > 60 days.
    // Uses { lastOrderAt, totalOrders } compound index.
    case 'RE_ENGAGE_SINGLE_PURCHASE': {
      const cutoff = new Date(now.getTime() - 60 * MS_PER_DAY);
      return {
        totalOrders: 1,
        lastOrderAt: { $lt: cutoff },
      };
    }

    // Champions/Promising who previously bought in the given category.
    // Two-step: Order.distinct (productCategory index) → Customer filter.
    case 'UPSELL_CATEGORY': {
      const cat = String(parameters.category ?? '').trim();
      if (!cat) {
        throw new AppError(422, 'UNPROCESSABLE', 'category is required for UPSELL_CATEGORY.', 'category');
      }
      if (cat.length > 100) {
        throw new AppError(422, 'UNPROCESSABLE', 'category must be ≤ 100 characters.', 'category');
      }
      // Uses { productCategory: 1 } index on orders
      const customerIds = await Order.distinct('customerId', { productCategory: cat }) as Types.ObjectId[];
      if (customerIds.length === 0) {
        // Return a filter that matches nothing — empty audience handled upstream
        return { _id: { $in: [] } };
      }
      return {
        _id:        { $in: customerIds },
        rfmSegment: { $in: ['CHAMPIONS', 'PROMISING'] },
      };
    }

    // High-frequency, high-spend VIP customers.
    case 'VIP_LOYALTY': {
      const minOrders = Number(parameters.minOrderCount ?? 3);
      const minSpend  = Number(parameters.minTotalSpend  ?? 0);
      if (!Number.isInteger(minOrders) || minOrders < 1 || minOrders > 100) {
        throw new AppError(422, 'UNPROCESSABLE', 'minOrderCount must be an integer 1–100.', 'minOrderCount');
      }
      if (isNaN(minSpend) || minSpend < 0) {
        throw new AppError(422, 'UNPROCESSABLE', 'minTotalSpend must be a non-negative number.', 'minTotalSpend');
      }
      return {
        totalOrders: { $gte: minOrders },
        totalSpend:  { $gte: minSpend },
      };
    }

    default: {
      // TypeScript exhaustiveness guard
      const _exhaustive: never = intentType;
      throw new AppError(422, 'UNPROCESSABLE', `Unsupported intentType: ${_exhaustive as string}`);
    }
  }
}

// ─── Audience aggregation ─────────────────────────────────────────────────────
// Two parallel aggregations:
//   1. Overall totals (count, medianAOV, channelMix)
//   2. Per-rfmSegment breakdown → cluster cards
//
// Both use the same $match filter so MongoDB can apply the same index path.

export async function queryAudienceStats(
  filter: Record<string, unknown>
): Promise<AudienceStats> {
  interface TotalsResult {
    count:    number;
    avgSpend: number;
    whatsapp: number;
    email:    number;
    sms:      number;
  }
  interface SegmentResult {
    _id:      string | null;
    count:    number;
    avgSpend: number;
    whatsapp: number;
    email:    number;
    sms:      number;
  }

  const channelNotOptedOut = (ch: string) => ({
    $cond: [{ $not: [{ $in: [ch, '$optOutChannels'] }] }, 1, 0],
  });

  const [totalsArr, segmentsArr] = await Promise.all([
    Customer.aggregate<TotalsResult>([
      { $match: filter },
      {
        $group: {
          _id:      null,
          count:    { $sum: 1 },
          avgSpend: { $avg: '$totalSpend' },
          whatsapp: { $sum: channelNotOptedOut('WHATSAPP') },
          email:    { $sum: channelNotOptedOut('EMAIL')    },
          sms:      { $sum: channelNotOptedOut('SMS')      },
        },
      },
    ]),

    Customer.aggregate<SegmentResult>([
      { $match: filter },
      {
        $group: {
          _id:      '$rfmSegment',
          count:    { $sum: 1 },
          avgSpend: { $avg: '$totalSpend' },
          whatsapp: { $sum: channelNotOptedOut('WHATSAPP') },
          email:    { $sum: channelNotOptedOut('EMAIL')    },
          sms:      { $sum: channelNotOptedOut('SMS')      },
        },
      },
      { $sort: { count: -1 } },  // largest cluster first
    ]),
  ]);

  const totals = totalsArr[0];
  if (!totals || totals.count === 0) {
    return { count: 0, medianAOV: 0, channelMix: {}, clusters: [], filter };
  }

  // Build channelMix — only include channels with reachable customers
  const channelMix: Record<string, number> = {};
  if (totals.whatsapp > 0) channelMix.WHATSAPP = totals.whatsapp;
  if (totals.email > 0)    channelMix.EMAIL    = totals.email;
  if (totals.sms > 0)      channelMix.SMS      = totals.sms;

  const clusters: ClusterCard[] = segmentsArr.map((seg) => {
    const ch: Record<string, number> = {};
    if (seg.whatsapp > 0) ch.WHATSAPP = seg.whatsapp;
    if (seg.email > 0)    ch.EMAIL    = seg.email;
    if (seg.sms > 0)      ch.SMS      = seg.sms;
    return {
      label:      seg._id ?? 'GENERAL',
      rfmSegment: seg._id ?? 'GENERAL',
      count:      seg.count,
      avgSpend:   Math.round(seg.avgSpend ?? 0),
      channels:   ch,
    };
  });

  return {
    count:      totals.count,
    medianAOV:  Math.round(totals.avgSpend ?? 0),
    channelMix,
    clusters,
    filter,
  };
}

// ─── Revenue estimate ─────────────────────────────────────────────────────────
// Uses historical ChannelStats if available (≥1 campaign for this type+channel).
// Falls back to cold-start benchmarks (AI_FEATURES.md §10).

export async function computeRevenueEstimate(
  count:      number,
  goalType:   CampaignType,
  medianAOV:  number,
  channelMix: Record<string, number>
): Promise<IRevenueEstimate> {
  // Pick the channel with the most reachable customers as the primary channel
  const primaryChannel = Object.entries(channelMix)
    .sort(([, a], [, b]) => b - a)[0]?.[0] as string | undefined;

  let conversionRate = BENCHMARK_RATES[goalType] ?? 0.05;
  let source: IRevenueEstimate['source'] = 'INDUSTRY_BENCHMARK';

  if (primaryChannel) {
    const stats = await ChannelStats.findOne({
      channel:      primaryChannel,
      campaignType: goalType,
    }).lean();
    if (stats && stats.campaignCount >= 1 && stats.conversionRate > 0) {
      conversionRate = stats.conversionRate;
      source = 'HISTORICAL_DATA';
    }
  }

  const expectedConversions = count * conversionRate;
  const midpoint = Math.round(expectedConversions * medianAOV);

  return {
    min:            Math.round(midpoint * 0.7),
    max:            Math.round(midpoint * 1.3),
    conversionRate,
    source,
  };
}
