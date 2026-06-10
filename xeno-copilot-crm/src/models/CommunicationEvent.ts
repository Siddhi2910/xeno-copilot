import { Schema, model, Types } from 'mongoose';
import { CHANNELS, type Channel } from './Customer';

// ─── Constants ────────────────────────────────────────────────────────────────

export const EVENT_TYPES = [
  'SENT',
  'DELIVERED',
  'FAILED',
  'OPENED',
  'CLICKED',
  'CONVERTED',
  'OPT_OUT',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

// Events that are NOT deduplicated — a second FAILED with a new error code is meaningful.
// All other events (SENT, DELIVERED, OPENED, CLICKED, CONVERTED) use idempotencyKey.
export const NON_IDEMPOTENT_EVENTS: EventType[] = ['FAILED', 'OPT_OUT'];

// ─── TypeScript interface ─────────────────────────────────────────────────────

export interface ICommunicationEvent {
  _id: Types.ObjectId;
  brandId: Types.ObjectId | null;
  // Links
  messageId:  Types.ObjectId;                      // FK → campaign_messages._id
  campaignId: Types.ObjectId;                      // denormalized for campaign-level queries
  customerId: Types.ObjectId;                      // denormalized for customer history queries
  clusterId:  Types.ObjectId | null;               // denormalized for cluster analytics
  // Event data
  channel:    Channel;
  eventType:  EventType;
  // Timing
  eventTimestamp: Date;    // time the event occurred (from Channel Service payload)
  receivedAt:     Date;    // time the CRM callback handler received it
  // Provider context
  providerMessageId: string | null;
  metadata:          Record<string, unknown> | null;
  // Idempotency key: SHA256("{messageId}:{eventType}")
  // First event wins. NON_IDEMPOTENT_EVENTS (FAILED, OPT_OUT) skip deduplication.
  idempotencyKey: string;
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const CommunicationEventSchema = new Schema<ICommunicationEvent>(
  {
    brandId: { type: Schema.Types.ObjectId, default: null },

    messageId: {
      type: Schema.Types.ObjectId,
      ref: 'CampaignMessage',
      required: [true, 'messageId is required'],
    },

    campaignId: {
      type: Schema.Types.ObjectId,
      ref: 'Campaign',
      required: [true, 'campaignId is required'],
    },

    customerId: {
      type: Schema.Types.ObjectId,
      ref: 'Customer',
      required: [true, 'customerId is required'],
    },

    clusterId: {
      type: Schema.Types.ObjectId,
      ref: 'CampaignCluster',
      default: null,
    },

    channel: {
      type: String,
      required: [true, 'channel is required'],
      enum: { values: CHANNELS as unknown as string[], message: 'invalid channel' },
    },

    eventType: {
      type: String,
      required: [true, 'eventType is required'],
      enum: { values: EVENT_TYPES as unknown as string[], message: 'invalid eventType' },
    },

    eventTimestamp: {
      type: Date,
      required: [true, 'eventTimestamp is required'],
      validate: {
        validator: (v: Date) => v <= new Date(Date.now() + 60_000), // allow 60s clock skew
        message: 'eventTimestamp must not be in the future',
      },
    },

    receivedAt: { type: Date, default: () => new Date() },

    providerMessageId: { type: String, default: null },
    metadata:          { type: Schema.Types.Mixed, default: null },

    // SHA256("{messageId}:{eventType}") — unique index enforces at-most-once storage
    idempotencyKey: {
      type: String,
      required: [true, 'idempotencyKey is required'],
    },
  },
  { collection: 'communication_events', timestamps: false }
);

// ─── Indexes (DATABASE_SCHEMA.md §14) ─────────────────────────────────────────

CommunicationEventSchema.index({ idempotencyKey: 1 }, { unique: true }); // most critical
CommunicationEventSchema.index({ messageId: 1 });
CommunicationEventSchema.index({ campaignId: 1, eventType: 1 });          // compound: event count by type
CommunicationEventSchema.index({ customerId: 1, eventType: 1 });          // compound: customer history
CommunicationEventSchema.index({ campaignId: 1, eventTimestamp: 1 });     // compound: time-series events

export const CommunicationEvent = model<ICommunicationEvent>(
  'CommunicationEvent',
  CommunicationEventSchema
);
