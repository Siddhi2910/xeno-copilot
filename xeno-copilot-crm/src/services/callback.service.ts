/**
 * callback.service.ts
 *
 * Handles delivery status callbacks from the Channel Service.
 *
 * Steps:
 *  1. Resolve messageId → CampaignMessage (get campaignId, clusterId, customerId, channel)
 *  2. Load hmacSecret via Campaign.findById().lean() (bypasses toJSON transform)
 *  3. HMAC-SHA256 signature verification (timingSafeEqual)
 *  4. Build idempotencyKey — SHA256("{messageId}:{eventType}") for normal events;
 *     SHA256("{messageId}:{eventType}:{Date.now()}") for NON_IDEMPOTENT_EVENTS (FAILED, OPT_OUT)
 *  5. Insert CommunicationEvent — duplicate key → { accepted: false, reason: 'DUPLICATE_EVENT' }
 *  6. Update CampaignMessage status + timestamp (conditional: only set if currently null)
 *  7. Increment CampaignCluster.stats.$field by 1
 *  8. For OPT_OUT: Customer.$addToSet optOutChannels
 *
 * The callback handler does NOT modify DispatchJob — the Channel Service manages its own job lifecycle.
 */

import { Types } from 'mongoose';
import { CampaignMessage }     from '../models/CampaignMessage';
import { Campaign }            from '../models/Campaign';
import { CampaignCluster }     from '../models/CampaignCluster';
import { CommunicationEvent, NON_IDEMPOTENT_EVENTS } from '../models/CommunicationEvent';
import { Customer }            from '../models/Customer';
import { AppError }            from '../middleware/errorHandler';
import { hmacVerify, sha256Hex } from '../lib/crypto';
import type { EventType }      from '../models/CommunicationEvent';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface CallbackPayload {
  messageId:  string;
  eventType:  EventType;
  timestamp:  string;
  providerId?: string;
  metadata?:  Record<string, unknown>;
}

export interface CallbackResult {
  accepted:   boolean;
  reason?:    string;
  eventId?:   string;
}

// ─── EventType → CampaignMessage field map ────────────────────────────────────

const EVENT_TO_STATUS_FIELD: Partial<Record<EventType, string>> = {
  SENT:      'sentAt',
  DELIVERED: 'deliveredAt',
  OPENED:    'openedAt',
  CLICKED:   'clickedAt',
  CONVERTED: 'convertedAt',
  FAILED:    'failedAt',
  // OPT_OUT does not set a timestamp field on CampaignMessage
};

// EventType → CampaignCluster.stats sub-field
const EVENT_TO_STATS_FIELD: Partial<Record<EventType, string>> = {
  SENT:      'sent',
  DELIVERED: 'delivered',
  OPENED:    'opened',
  CLICKED:   'clicked',
  CONVERTED: 'converted',
  FAILED:    'failed',
};

// Ordered status progression — only advance forward
const STATUS_RANK: Record<string, number> = {
  QUEUED:    0,
  SENT:      1,
  DELIVERED: 2,
  FAILED:    2,
  OPENED:    3,
  CLICKED:   4,
  CONVERTED: 5,
};

// ─── Service ──────────────────────────────────────────────────────────────────

export async function handleDeliveryCallback(
  rawBody:   string,
  signature: string,
  payload:   CallbackPayload,
): Promise<CallbackResult> {

  const messageObjId = new Types.ObjectId(payload.messageId);

  // ── 1. Load CampaignMessage ─────────────────────────────────────────────────
  const message = await CampaignMessage.findById(messageObjId, {
    campaignId: 1,
    clusterId:  1,
    customerId: 1,
    channel:    1,
    status:     1,
  }).lean();

  if (!message) {
    throw new AppError(404, 'NOT_FOUND', `Message ${payload.messageId} not found.`);
  }

  // ── 2. Load hmacSecret (lean bypasses toJSON strip) ─────────────────────────
  const campaign = await Campaign.findById(message.campaignId, { hmacSecret: 1 }).lean();
  if (!campaign?.hmacSecret) {
    throw new AppError(404, 'NOT_FOUND', `Campaign for message ${payload.messageId} not found or has no hmacSecret.`);
  }

  // ── 3. HMAC verification ───────────────────────────────────────────────────
  if (!hmacVerify(campaign.hmacSecret, rawBody, signature)) {
    throw new AppError(401, 'UNAUTHORIZED', 'Invalid callback signature.');
  }

  // ── 4. Idempotency key ─────────────────────────────────────────────────────
  const isNonIdempotent = NON_IDEMPOTENT_EVENTS.includes(payload.eventType);
  const idempotencyKey  = isNonIdempotent
    ? sha256Hex(`${payload.messageId}:${payload.eventType}:${Date.now()}`)
    : sha256Hex(`${payload.messageId}:${payload.eventType}`);

  // ── 5. Insert CommunicationEvent ──────────────────────────────────────────
  let eventDoc: { _id: Types.ObjectId } | null = null;
  try {
    const created = await CommunicationEvent.create({
      messageId:         messageObjId,
      campaignId:        message.campaignId,
      customerId:        message.customerId,
      clusterId:         message.clusterId ?? null,
      channel:           message.channel,
      eventType:         payload.eventType,
      eventTimestamp:    new Date(payload.timestamp),
      providerMessageId: payload.providerId ?? null,
      metadata:          payload.metadata   ?? null,
      idempotencyKey,
    });
    eventDoc = created;
  } catch (err: unknown) {
    // MongoDB duplicate key (E11000) → idempotent duplicate
    const e = err as { code?: number; message?: string };
    if (e?.code === 11000) {
      return { accepted: false, reason: 'DUPLICATE_EVENT' };
    }
    throw err;
  }

  // ── 6. Update CampaignMessage status + timestamp ──────────────────────────
  const now            = new Date();
  const tsField        = EVENT_TO_STATUS_FIELD[payload.eventType];
  const currentRank    = STATUS_RANK[message.status] ?? 0;
  const incomingRank   = STATUS_RANK[payload.eventType] ?? 0;

  const messageUpdate: Record<string, unknown> = {};

  // Advance status only if incoming rank is higher than current
  if (incomingRank > currentRank && payload.eventType !== 'OPT_OUT') {
    messageUpdate['status'] = payload.eventType;
  }

  // Set timestamp field only if it is currently null (idempotent)
  if (tsField) {
    // Use aggregation pipeline update: $cond $ifNull pattern
    // Fallback to plain updateOne with $set + filter for simplicity
    await CampaignMessage.updateOne(
      { _id: messageObjId, [tsField]: null },
      { $set: { [tsField]: now, ...(messageUpdate['status'] ? { status: messageUpdate['status'] } : {}) } },
    );

    // If timestamp was already set but status still needs advancing, do a separate status update
    if (messageUpdate['status']) {
      await CampaignMessage.updateOne(
        { _id: messageObjId, status: { $nin: ['CONVERTED', 'CLICKED', payload.eventType as string] } },
        { $set: { status: messageUpdate['status'] } },
      ).catch(() => { /* best-effort status advance */ });
    }
  } else if (payload.eventType === 'OPT_OUT') {
    // OPT_OUT: no status advance on message, handled below
  }

  // Special case: FAILED should always set failureReason + failedAt
  if (payload.eventType === 'FAILED') {
    const reason = (payload.metadata?.reason as string) ?? (payload.metadata?.error as string) ?? null;
    await CampaignMessage.updateOne(
      { _id: messageObjId, failedAt: null },
      { $set: { status: 'FAILED', failedAt: now, failureReason: reason } },
    );
  }

  // ── 7. Increment CampaignCluster stats ────────────────────────────────────
  const statsField = EVENT_TO_STATS_FIELD[payload.eventType];
  if (statsField && message.clusterId) {
    await CampaignCluster.updateOne(
      { _id: message.clusterId },
      { $inc: { [`stats.${statsField}`]: 1 } },
    ).catch(() => { /* best-effort — don't fail the callback */ });
  }

  // ── 8. OPT_OUT: add channel to customer's optOutChannels ─────────────────
  if (payload.eventType === 'OPT_OUT') {
    await Customer.updateOne(
      { _id: message.customerId },
      { $addToSet: { optOutChannels: message.channel } },
    ).catch(() => { /* best-effort */ });
  }

  return {
    accepted: true,
    eventId:  eventDoc._id.toHexString(),
  };
}
