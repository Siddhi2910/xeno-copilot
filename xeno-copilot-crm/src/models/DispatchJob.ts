import { Schema, model, Types } from 'mongoose';
import { CHANNELS, type Channel } from './Customer';

// ─── Constants ────────────────────────────────────────────────────────────────

export const DISPATCH_STATUSES = ['QUEUED', 'PROCESSING', 'DONE', 'FAILED'] as const;
export type DispatchStatus = (typeof DISPATCH_STATUSES)[number];

// ─── TypeScript interfaces ────────────────────────────────────────────────────

export interface IMessagePayload {
  subject:           string | null;  // email subject — null for WhatsApp/SMS
  body:              string;
  ctaUrl:            string | null;  // original destination URL
  clickTrackingPath: string | null;  // "/track/click/{messageId}" — injected into body at dispatch
}

export interface IDispatchJob {
  _id: Types.ObjectId;
  brandId: Types.ObjectId | null;
  // Campaign context
  campaignId:  Types.ObjectId;
  messageId:   Types.ObjectId;     // FK → campaign_messages._id — updated on callback
  customerId:  Types.ObjectId;     // FK → customers._id — for audit trail
  // Dispatch payload
  channel:        Channel;
  recipient:      string;          // phone (E.164) or email
  messagePayload: IMessagePayload;
  // Callback config — Channel Service uses these to POST status updates back to CRM
  callbackUrl:        string;
  callbackHmacSecret: string;      // copied from campaigns.hmacSecret at fan-out time
  // Queue mechanics
  status:           DispatchStatus;
  attempts:         number;        // 0 on creation, incremented on each attempt, max 3
  lastAttemptedAt:  Date | null;
  error:            string | null;
  createdAt:        Date;
}

// ─── Sub-schema ───────────────────────────────────────────────────────────────

const MessagePayloadSchema = new Schema<IMessagePayload>(
  {
    subject:           { type: String, default: null },
    body:              { type: String, required: [true, 'messagePayload.body is required'] },
    ctaUrl:            { type: String, default: null },
    clickTrackingPath: { type: String, default: null },
  },
  { _id: false }
);

// ─── Main Schema ──────────────────────────────────────────────────────────────

const DispatchJobSchema = new Schema<IDispatchJob>(
  {
    brandId: { type: Schema.Types.ObjectId, default: null },

    campaignId: {
      type: Schema.Types.ObjectId,
      ref: 'Campaign',
      required: [true, 'campaignId is required'],
    },

    messageId: {
      type: Schema.Types.ObjectId,
      ref: 'CampaignMessage',
      required: [true, 'messageId is required'],
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

    messagePayload: { type: MessagePayloadSchema, required: true },

    callbackUrl: {
      type: String,
      required: [true, 'callbackUrl is required'],
      trim: true,
    },

    // 32-byte hex HMAC secret — copied from campaigns.hmacSecret at fan-out time
    callbackHmacSecret: {
      type: String,
      required: [true, 'callbackHmacSecret is required'],
      validate: {
        validator: (v: string) => /^[0-9a-f]{64}$/.test(v),
        message: 'callbackHmacSecret must be a 64-character hex string',
      },
    },

    status: {
      type: String,
      required: [true, 'status is required'],
      enum: { values: DISPATCH_STATUSES as unknown as string[], message: 'invalid status' },
      default: 'QUEUED',
    },

    attempts: {
      type: Number,
      default: 0,
      min: [0, 'attempts must be ≥ 0'],
      max: [3, 'attempts must be ≤ 3'],
    },

    lastAttemptedAt: { type: Date, default: null },
    error:           { type: String, default: null },
    createdAt:       { type: Date, default: () => new Date() },
  },
  { collection: 'dispatch_jobs', timestamps: false }
);

// ─── Indexes (DATABASE_SCHEMA.md §14) ─────────────────────────────────────────
//
// { status: 1, createdAt: 1 } is the MOST CRITICAL INDEX in the entire schema.
// The Channel Service poll query hits it every 2 seconds:
//   findOneAndUpdate({ status: "QUEUED" }).sort({ createdAt: 1 })
// FIFO order. Without this index, every poll is a full collection scan.

DispatchJobSchema.index({ status: 1, createdAt: 1 });             // CRITICAL: Channel Service poll
DispatchJobSchema.index({ campaignId: 1, status: 1 });            // compound: campaign queue depth
DispatchJobSchema.index({ messageId: 1 });                        // debugging: job by message

export const DispatchJob = model<IDispatchJob>('DispatchJob', DispatchJobSchema);
