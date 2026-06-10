import { Schema, model, Types } from 'mongoose';
import { CHANNELS, type Channel } from './Customer';

// ─── Constants ────────────────────────────────────────────────────────────────

export const CHANNEL_CONFIDENCE_LEVELS = ['HIGH', 'MEDIUM', 'LOW'] as const;
export type ChannelConfidence = (typeof CHANNEL_CONFIDENCE_LEVELS)[number];

// ─── TypeScript interfaces ────────────────────────────────────────────────────

export interface IClusterMessage {
  subject:    string | null;     // null for WhatsApp / SMS
  body:       string;
  ctaText:    string | null;
  ctaUrl:     string | null;
  rationale:  string | null;     // LLM explanation of message choice
}

export interface IClusterStats {
  queued:    number;
  sent:      number;
  delivered: number;
  failed:    number;
  opened:    number;
  clicked:   number;
  converted: number;
}

export interface ICampaignCluster {
  _id: Types.ObjectId;
  brandId: Types.ObjectId | null;
  campaignId: Types.ObjectId;
  // Cluster definition (from LLM Calls 2 & 3)
  clusterLabel:           string;
  clusterDescription:     string | null;
  clusterRationale:       string | null;
  rfmPatternDescription:  string | null;
  // Audience
  memberCount: number;
  // Channel assignment
  assignedChannel:          Channel;
  channelConfidence:         ChannelConfidence;
  channelConfidenceReason:   string | null;
  // Message template
  message: IClusterMessage;
  // Aggregated delivery stats — incremented atomically via $inc by callback handler
  stats: IClusterStats;
  createdAt: Date;
}

// ─── Sub-schemas ──────────────────────────────────────────────────────────────

const ClusterMessageSchema = new Schema<IClusterMessage>(
  {
    subject:   { type: String, default: null },
    body: {
      type: String,
      required: [true, 'message.body is required'],
      minlength: [10, 'message.body must be ≥ 10 characters'],
      maxlength: [1600, 'message.body must be ≤ 1600 characters'],
    },
    ctaText:   { type: String, default: null },
    ctaUrl:    { type: String, default: null },
    rationale: { type: String, default: null },
  },
  { _id: false }
);

// Expand each field inline — TypeScript cannot narrow a reused variable to satisfy
// Mongoose's per-field schema type constraint in a typed Schema<T>.
const ClusterStatsSchema = new Schema<IClusterStats>(
  {
    queued:    { type: Number, default: 0, min: [0, 'queued must be ≥ 0'] },
    sent:      { type: Number, default: 0, min: [0, 'sent must be ≥ 0'] },
    delivered: { type: Number, default: 0, min: [0, 'delivered must be ≥ 0'] },
    failed:    { type: Number, default: 0, min: [0, 'failed must be ≥ 0'] },
    opened:    { type: Number, default: 0, min: [0, 'opened must be ≥ 0'] },
    clicked:   { type: Number, default: 0, min: [0, 'clicked must be ≥ 0'] },
    converted: { type: Number, default: 0, min: [0, 'converted must be ≥ 0'] },
  },
  { _id: false }
);

// ─── Main Schema ──────────────────────────────────────────────────────────────

const CampaignClusterSchema = new Schema<ICampaignCluster>(
  {
    brandId: { type: Schema.Types.ObjectId, default: null },

    campaignId: {
      type: Schema.Types.ObjectId,
      ref: 'Campaign',
      required: [true, 'campaignId is required'],
    },

    clusterLabel: {
      type: String,
      required: [true, 'clusterLabel is required'],
      trim: true,
      maxlength: [100, 'clusterLabel must be ≤ 100 characters'],
    },

    clusterDescription:    { type: String, default: null },
    clusterRationale:      { type: String, default: null },
    rfmPatternDescription: { type: String, default: null },

    memberCount: {
      type: Number,
      required: [true, 'memberCount is required'],
      min: [0, 'memberCount must be ≥ 0'],
    },

    assignedChannel: {
      type: String,
      required: [true, 'assignedChannel is required'],
      enum: { values: CHANNELS as unknown as string[], message: 'invalid assignedChannel' },
    },

    channelConfidence: {
      type: String,
      required: [true, 'channelConfidence is required'],
      enum: { values: CHANNEL_CONFIDENCE_LEVELS as unknown as string[], message: 'invalid channelConfidence' },
    },

    channelConfidenceReason: { type: String, default: null },

    message: { type: ClusterMessageSchema, required: true },

    stats: { type: ClusterStatsSchema, default: () => ({}) },

    createdAt: { type: Date, default: () => new Date() },
  },
  { collection: 'campaign_clusters', timestamps: false }
);

// ─── Indexes (DATABASE_SCHEMA.md §14) ─────────────────────────────────────────

CampaignClusterSchema.index({ campaignId: 1 });
CampaignClusterSchema.index(
  { campaignId: 1, clusterLabel: 1 },
  { unique: true }  // one clusterLabel per campaign
);

export const CampaignCluster = model<ICampaignCluster>('CampaignCluster', CampaignClusterSchema);
