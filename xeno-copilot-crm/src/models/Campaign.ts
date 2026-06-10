import { Schema, model, Types } from 'mongoose';
import { CAMPAIGN_TYPES, type CampaignType } from './ChannelStats';

// ─── Constants ────────────────────────────────────────────────────────────────

export const CAMPAIGN_STATUSES = [
  'DRAFT',
  'READY_FOR_REVIEW',
  'LAUNCHING',
  'ACTIVE',
  'COMPLETED',
  'FAILED',
] as const;

export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

// ─── TypeScript interfaces ────────────────────────────────────────────────────

export interface IIntentParameters {
  dormancyDays:       number | null;
  minOrders:          number | null;
  maxOrders:          number | null;
  minSpend:           number | null;
  productCategory:    string | null;
  acquisitionChannel: string | null;
}

export interface IAudienceSnapshot {
  count:      number;
  medianAOV:  number;
  channelMix: Record<string, number>;
  savedAt:    Date;
}

export interface IRevenueEstimate {
  min:            number;
  max:            number;
  conversionRate: number;
  source:         'INDUSTRY_BENCHMARK' | 'HISTORICAL_DATA';
}

export interface ICampaign {
  _id: Types.ObjectId;
  brandId: Types.ObjectId | null;
  // Basic metadata
  name:     string;
  goalText: string;
  goalType: CampaignType;
  // Lifecycle
  status:   CampaignStatus;
  // Audience definition — written at DRAFT after Human Gate 2
  intentType:       CampaignType | null;
  intentParameters: IIntentParameters | null;
  audienceFilter:   Record<string, unknown> | null;  // safe MongoDB query — NOT LLM output
  audienceSnapshot: IAudienceSnapshot | null;
  // Execution
  totalRecipients: number | null;
  scheduledAt:     Date | null;
  launchedAt:      Date | null;
  completedAt:     Date | null;
  // Security — never returned in API responses (excluded via toJSON)
  hmacSecret: string | null;
  // Revenue
  revenueEstimate: IRevenueEstimate | null;
  // AI report (populated at T+48h by Call 5)
  aiReport:             string | null;
  aiReportGeneratedAt:  Date | null;
  // Timestamps
  createdAt:    Date;
  draftSavedAt: Date | null;
}

// ─── Sub-schemas ──────────────────────────────────────────────────────────────

const IntentParametersSchema = new Schema<IIntentParameters>(
  {
    dormancyDays: {
      type: Number,
      default: null,
      validate: {
        validator: (v: number | null) => v === null || (Number.isInteger(v) && v >= 1 && v <= 730),
        message: 'dormancyDays must be an integer 1–730 or null',
      },
    },
    minOrders: {
      type: Number,
      default: null,
      validate: {
        validator: (v: number | null) => v === null || (Number.isInteger(v) && v >= 1 && v <= 100),
        message: 'minOrders must be an integer 1–100 or null',
      },
    },
    maxOrders:          { type: Number, default: null },
    minSpend:           { type: Number, default: null, min: 0 },
    productCategory:    { type: String, default: null },
    acquisitionChannel: { type: String, default: null },
  },
  { _id: false }
);

const AudienceSnapshotSchema = new Schema<IAudienceSnapshot>(
  {
    count:      { type: Number, required: true, min: 0 },
    medianAOV:  { type: Number, required: true, min: 0 },
    channelMix: { type: Schema.Types.Mixed, required: true },
    savedAt:    { type: Date, required: true },
  },
  { _id: false }
);

const RevenueEstimateSchema = new Schema<IRevenueEstimate>(
  {
    min:            { type: Number, required: true, min: 0 },
    max:            { type: Number, required: true, min: 0 },
    conversionRate: {
      type: Number,
      required: true,
      min: [0, 'conversionRate must be 0–1'],
      max: [1, 'conversionRate must be 0–1'],
    },
    source: {
      type: String,
      required: true,
      enum: ['INDUSTRY_BENCHMARK', 'HISTORICAL_DATA'],
    },
  },
  { _id: false }
);

// ─── Main Schema ──────────────────────────────────────────────────────────────

const CampaignSchema = new Schema<ICampaign>(
  {
    brandId: { type: Schema.Types.ObjectId, default: null },

    name: {
      type: String,
      required: [true, 'name is required'],
      trim: true,
      maxlength: [200, 'name must be ≤ 200 characters'],
    },

    goalText: {
      type: String,
      required: [true, 'goalText is required'],
      trim: true,
      minlength: [10, 'goalText must be ≥ 10 characters'],
      maxlength: [500, 'goalText must be ≤ 500 characters'],
    },

    goalType: {
      type: String,
      required: [true, 'goalType is required'],
      enum: { values: CAMPAIGN_TYPES as unknown as string[], message: 'invalid goalType' },
    },

    // Status — see SYSTEM_ARCHITECTURE.md §4.4 for state machine
    status: {
      type: String,
      required: [true, 'status is required'],
      enum: { values: CAMPAIGN_STATUSES as unknown as string[], message: 'invalid status' },
      default: 'DRAFT',
    },

    // Audience definition (written at DRAFT, after Human Gate 2)
    intentType: {
      type: String,
      default: null,
      enum: { values: [...(CAMPAIGN_TYPES as unknown as string[]), null], message: 'invalid intentType' },
    },
    intentParameters: { type: IntentParametersSchema, default: null },
    audienceFilter:   { type: Schema.Types.Mixed, default: null },  // pre-built safe query — never from LLM
    audienceSnapshot: { type: AudienceSnapshotSchema, default: null },

    // Execution
    totalRecipients: { type: Number, default: null, min: 0 },
    scheduledAt:     { type: Date, default: null },
    launchedAt:      { type: Date, default: null },
    completedAt:     { type: Date, default: null },

    // 32-byte hex secret generated at launch — used by Channel Service for HMAC callback signing
    // Never included in API responses (stripped by toJSON transform below)
    hmacSecret: { type: String, default: null },

    revenueEstimate: { type: RevenueEstimateSchema, default: null },

    // AI report — populated async by Call 5 at T+48h
    aiReport:            { type: String, default: null },
    aiReportGeneratedAt: { type: Date, default: null },

    createdAt:    { type: Date, default: () => new Date() },
    draftSavedAt: { type: Date, default: null },
  },
  { collection: 'campaigns', timestamps: false }
);

// ─── Security: strip hmacSecret from all JSON serialisation ───────────────────
// The secret must remain readable on the Mongoose document object (for service-layer use).
// It must never appear in API responses.

CampaignSchema.set('toJSON', {
  versionKey: false,
  transform: (_doc, ret) => {
    // Cast is safe: `ret` is the plain object representation of the Mongoose document.
    // We delete the field from the serialised output — the in-memory document is unaffected.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (ret as any).hmacSecret;
    return ret;
  },
});

// ─── Indexes (DATABASE_SCHEMA.md §14) ─────────────────────────────────────────

CampaignSchema.index({ status: 1 });
CampaignSchema.index({ status: 1, launchedAt: -1 });      // compound: active campaigns, most recent first
CampaignSchema.index({ launchedAt: 1 });                  // conversion detection: 14-day window
CampaignSchema.index({ completedAt: 1 }, { sparse: true }); // sparse: post-campaign report trigger
CampaignSchema.index({ goalType: 1 });
CampaignSchema.index({ createdAt: -1 });

export const Campaign = model<ICampaign>('Campaign', CampaignSchema);
