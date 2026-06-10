import { Schema, model, Types } from 'mongoose';
import { CHANNELS, type Channel } from './Customer';

// ─── Constants ────────────────────────────────────────────────────────────────

export const MESSAGE_STATUSES = [
  'QUEUED',
  'SENT',
  'DELIVERED',
  'FAILED',
  'OPENED',
  'CLICKED',
  'CONVERTED',
] as const;

export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

// ─── TypeScript interface ─────────────────────────────────────────────────────

export interface ICampaignMessage {
  _id: Types.ObjectId;
  brandId: Types.ObjectId | null;
  campaignId:  Types.ObjectId;
  clusterId:   Types.ObjectId;
  customerId:  Types.ObjectId;
  channel:     Channel;
  recipient:   string;              // phone (E.164) or email address
  // Click tracking — set at dispatch time
  clickTrackingPath: string | null; // "/track/click/{_id}"
  ctaUrl:            string | null; // denormalized from campaign_clusters.message.ctaUrl
                                    // enables single-query redirect — no join needed
  // Current delivery state (last-write-wins, updated on each callback)
  status: MessageStatus;
  // Status timestamps — null until that status is first reached (idempotent update)
  queuedAt:    Date | null;
  sentAt:      Date | null;
  deliveredAt: Date | null;
  openedAt:    Date | null;
  clickedAt:   Date | null;
  convertedAt: Date | null;
  failedAt:    Date | null;
  failureReason: string | null;
  createdAt: Date;
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const CampaignMessageSchema = new Schema<ICampaignMessage>(
  {
    brandId: { type: Schema.Types.ObjectId, default: null },

    campaignId: {
      type: Schema.Types.ObjectId,
      ref: 'Campaign',
      required: [true, 'campaignId is required'],
    },

    clusterId: {
      type: Schema.Types.ObjectId,
      ref: 'CampaignCluster',
      required: [true, 'clusterId is required'],
    },

    customerId: {
      type: Schema.Types.ObjectId,
      ref: 'Customer',
      required: [true, 'customerId is required'],
    },

    channel: {
      type: String,
      required: [true, 'channel is required'],
      enum: { values: CHANNELS as unknown as string[], message: 'invalid channel' },
    },

    recipient: { type: String, required: [true, 'recipient is required'], trim: true },

    // Set at dispatch time during campaign launch fan-out
    clickTrackingPath: { type: String, default: null },
    ctaUrl:            { type: String, default: null },

    status: {
      type: String,
      required: [true, 'status is required'],
      enum: { values: MESSAGE_STATUSES as unknown as string[], message: 'invalid status' },
      default: 'QUEUED',
    },

    // Timestamp fields — set once on first event (idempotent: only update if currently null)
    queuedAt:    { type: Date, default: null },
    sentAt:      { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
    openedAt:    { type: Date, default: null },
    clickedAt:   { type: Date, default: null },
    convertedAt: { type: Date, default: null },
    failedAt:    { type: Date, default: null },

    failureReason: { type: String, default: null },
    createdAt:     { type: Date, default: () => new Date() },
  },
  { collection: 'campaign_messages', timestamps: false }
);

// ─── Indexes (DATABASE_SCHEMA.md §14) ─────────────────────────────────────────

CampaignMessageSchema.index({ campaignId: 1 });
CampaignMessageSchema.index({ campaignId: 1, status: 1 });           // compound: funnel by status
CampaignMessageSchema.index({ customerId: 1 });
CampaignMessageSchema.index(
  { customerId: 1, campaignId: 1 },
  { unique: true }                                                    // one message per customer per campaign
);
CampaignMessageSchema.index({ campaignId: 1, clusterId: 1, status: 1 }); // compound: per-cluster funnel
CampaignMessageSchema.index(
  { status: 1, convertedAt: 1 },
  { sparse: true }                                                    // sparse: null convertedAt skipped
);

export const CampaignMessage = model<ICampaignMessage>('CampaignMessage', CampaignMessageSchema);
