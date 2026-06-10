import { Schema, model, Types } from 'mongoose';
import { CHANNELS, type Channel } from './Customer';

// ─── Constants ────────────────────────────────────────────────────────────────

export const CAMPAIGN_TYPES = [
  'WIN_BACK',
  'REWARD_LOYAL',
  'UPSELL',
  'CROSS_SELL',
  'ANNOUNCEMENT',
  'CUSTOM',
] as const;

export type CampaignType = (typeof CAMPAIGN_TYPES)[number];

// ─── TypeScript interface ─────────────────────────────────────────────────────

export interface IChannelStats {
  _id: Types.ObjectId;
  brandId: Types.ObjectId | null;
  channel: Channel;
  campaignType: CampaignType;
  // Cumulative totals
  totalSent:      number;
  totalDelivered: number;
  totalOpened:    number;
  totalClicked:   number;
  totalConverted: number;
  // Computed rates — recalculated after each update
  deliveryRate:   number;
  openRate:       number;
  clickRate:      number;
  conversionRate: number;
  // Metadata
  campaignCount:  number;
  lastUpdatedAt:  Date | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const rateValidator = {
  validator: (v: number) => v >= 0 && v <= 1,
  message: '{PATH} must be a rate between 0.0 and 1.0',
};

// ─── Schema ───────────────────────────────────────────────────────────────────

const ChannelStatsSchema = new Schema<IChannelStats>(
  {
    brandId: { type: Schema.Types.ObjectId, default: null },

    channel: {
      type: String,
      required: [true, 'channel is required'],
      enum: { values: CHANNELS as unknown as string[], message: 'invalid channel' },
    },

    campaignType: {
      type: String,
      required: [true, 'campaignType is required'],
      enum: { values: CAMPAIGN_TYPES as unknown as string[], message: 'invalid campaignType' },
    },

    totalSent:      { type: Number, default: 0, min: 0 },
    totalDelivered: { type: Number, default: 0, min: 0 },
    totalOpened:    { type: Number, default: 0, min: 0 },
    totalClicked:   { type: Number, default: 0, min: 0 },
    totalConverted: { type: Number, default: 0, min: 0 },

    deliveryRate:   { type: Number, default: 0, validate: rateValidator },
    openRate:       { type: Number, default: 0, validate: rateValidator },
    clickRate:      { type: Number, default: 0, validate: rateValidator },
    conversionRate: { type: Number, default: 0, validate: rateValidator },

    campaignCount:  { type: Number, default: 0, min: 0 },
    lastUpdatedAt:  { type: Date, default: null },
  },
  { collection: 'channel_stats', timestamps: false }
);

// ─── Indexes (DATABASE_SCHEMA.md §14) ─────────────────────────────────────────
// One document per {channel, campaignType} combination.
// Used for upsert on campaign completion.

ChannelStatsSchema.index({ channel: 1, campaignType: 1 }, { unique: true });

export const ChannelStats = model<IChannelStats>('ChannelStats', ChannelStatsSchema);
