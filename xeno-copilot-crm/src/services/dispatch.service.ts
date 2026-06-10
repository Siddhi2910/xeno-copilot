/**
 * dispatch.service.ts
 *
 * Campaign launch fan-out. Translates an audience into individual dispatch jobs.
 *
 * Steps:
 *  1. Atomic status gate: READY_FOR_REVIEW → LAUNCHING (findOneAndUpdate prevents double-launch)
 *  2. Generate hmacSecret once per campaign (stored for Channel Service callback signing)
 *  3. Query customers using campaign.audienceFilter (the safe, pre-built MongoDB query)
 *  4. Assign each customer to a cluster by rfmSegment → clusterLabel match
 *  5. BulkWrite CampaignMessage + DispatchJob documents (ordered: false)
 *  6. Increment CampaignCluster.stats.queued per cluster via $inc
 *  7. Transition LAUNCHING → ACTIVE
 *
 * External providers are NOT called here. The Channel Service polls dispatch_jobs
 * and handles actual sending.
 */

import { Types } from 'mongoose';
import { Campaign }         from '../models/Campaign';
import { Customer }         from '../models/Customer';
import { CampaignCluster }  from '../models/CampaignCluster';
import { CampaignMessage }  from '../models/CampaignMessage';
import { DispatchJob }      from '../models/DispatchJob';
import { AppError }         from '../middleware/errorHandler';
import { generateSecret }   from '../lib/crypto';

// ─── Result shape ──────────────────────────────────────────────────────────────

export interface LaunchResult {
  campaignId:          string;
  status:              'ACTIVE';
  totalRecipients:     number;
  dispatchJobsCreated: number;
  scheduledAt:         Date | null;
  launchedAt:          Date;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export async function launchCampaign(
  campaignId:  string,
  scheduledAt: Date | null = null,
): Promise<LaunchResult> {

  if (!Types.ObjectId.isValid(campaignId)) {
    throw new AppError(404, 'NOT_FOUND', `Campaign ${campaignId} not found.`);
  }
  const campaignObjId = new Types.ObjectId(campaignId);
  const now           = new Date();

  // ── 1. Atomic gate: READY_FOR_REVIEW → LAUNCHING ─────────────────────────
  // findOneAndUpdate with status filter prevents concurrent double-launches.
  const campaign = await Campaign.findOneAndUpdate(
    { _id: campaignObjId, status: 'READY_FOR_REVIEW' },
    {
      $set: {
        status:     'LAUNCHING',
        launchedAt: now,
        ...(scheduledAt ? { scheduledAt } : {}),
      },
    },
    { new: true },
  ).lean();

  if (!campaign) {
    const existing = await Campaign.findById(campaignObjId, { status: 1 }).lean();
    if (!existing) {
      throw new AppError(404, 'NOT_FOUND', `Campaign ${campaignId} not found.`);
    }
    throw new AppError(
      422,
      'UNPROCESSABLE',
      `Campaign must be in READY_FOR_REVIEW status to launch. Current status: ${existing.status}.`,
    );
  }

  // ── Guard: must have an audience filter and snapshot ─────────────────────
  if (!campaign.audienceFilter || !campaign.audienceSnapshot?.count) {
    await Campaign.updateOne(
      { _id: campaignObjId },
      { $set: { status: 'READY_FOR_REVIEW', launchedAt: null } },
    );
    throw new AppError(
      422,
      'UNPROCESSABLE',
      'Campaign has 0 recipients. Cannot launch an empty campaign.',
    );
  }

  try {
    // ── 2. HMAC secret (generate once; copied to every DispatchJob) ──────────
    let hmacSecret = campaign.hmacSecret;
    if (!hmacSecret) {
      hmacSecret = generateSecret(32);   // 32 bytes → 64-char hex
      await Campaign.updateOne({ _id: campaignObjId }, { $set: { hmacSecret } });
    }

    // ── 3. Load clusters ──────────────────────────────────────────────────────
    const clusters = await CampaignCluster.find({ campaignId: campaignObjId }).lean();
    if (clusters.length === 0) {
      throw new AppError(
        422,
        'UNPROCESSABLE',
        'Campaign has no message clusters. Generate messages before launching.',
      );
    }

    // clusterLabel was set to rfmSegment in ai/generate-campaign — used for customer→cluster matching
    const segmentToCluster = new Map(clusters.map((c) => [c.clusterLabel, c]));
    const defaultCluster   = clusters[0];

    // ── 4. Query audience customers ───────────────────────────────────────────
    const customers = await Customer.find(
      campaign.audienceFilter as Record<string, unknown>,
      { _id: 1, phone: 1, email: 1, name: 1, rfmSegment: 1, optOutChannels: 1 },
    ).lean();

    if (customers.length === 0) {
      throw new AppError(
        422,
        'UNPROCESSABLE',
        'Campaign has 0 recipients. Cannot launch an empty campaign.',
      );
    }

    // ── 5. Build BulkWrite ops ────────────────────────────────────────────────
    const callbackUrl = `${process.env.CRM_SERVICE_URL ?? 'http://localhost:3001'}/api/v1/callbacks/delivery`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messageOps: any[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const jobOps: any[]     = [];

    // Track queued-count per clusterId for stats increment
    const clusterCounts = new Map<string, number>();

    for (const customer of customers) {
      const cluster = segmentToCluster.get(customer.rfmSegment ?? '') ?? defaultCluster;

      // Skip customers who have opted out of this cluster's assigned channel
      if (Array.isArray(customer.optOutChannels) && customer.optOutChannels.includes(cluster.assignedChannel)) {
        continue;
      }

      const messageId      = new Types.ObjectId();
      const clickTrackPath = `/api/v1/track/click/${messageId.toHexString()}`;
      const recipient      = cluster.assignedChannel === 'EMAIL'
        ? (customer.email ?? customer.phone)
        : customer.phone;

      messageOps.push({
        insertOne: {
          document: {
            _id:              messageId,
            campaignId:       campaignObjId,
            clusterId:        cluster._id,
            customerId:       customer._id,
            channel:          cluster.assignedChannel,
            recipient,
            clickTrackingPath: clickTrackPath,
            ctaUrl:           cluster.message.ctaUrl ?? null,
            status:           'QUEUED',
            queuedAt:         now,
            createdAt:        now,
          },
        },
      });

      jobOps.push({
        insertOne: {
          document: {
            campaignId:  campaignObjId,
            messageId,
            customerId:  customer._id,
            channel:     cluster.assignedChannel,
            recipient,
            messagePayload: {
              subject:           cluster.message.subject ?? null,
              // Resolve {name} at fan-out; {ctaUrl} is replaced by Channel Service
              // with clickTrackingPath so click events can be tracked.
              body:              cluster.message.body.replace(/\{name\}/g, customer.name),
              ctaUrl:            cluster.message.ctaUrl ?? null,
              clickTrackingPath: clickTrackPath,
            },
            callbackUrl,
            callbackHmacSecret: hmacSecret,
            status:             'QUEUED',
            attempts:           0,
            lastAttemptedAt:    null,
            error:              null,
            createdAt:          now,
          },
        },
      });

      const cid = (cluster._id as Types.ObjectId).toHexString();
      clusterCounts.set(cid, (clusterCounts.get(cid) ?? 0) + 1);
    }

    if (messageOps.length === 0) {
      throw new AppError(
        422,
        'UNPROCESSABLE',
        'Campaign has 0 reachable recipients after opt-out filtering.',
      );
    }

    // BulkWrite both collections in parallel — ordered: false tolerates partial success
    await Promise.all([
      CampaignMessage.bulkWrite(messageOps, { ordered: false }),
      DispatchJob.bulkWrite(jobOps,         { ordered: false }),
    ]);

    // ── 6. Increment CampaignCluster.stats.queued ─────────────────────────────
    await Promise.all(
      [...clusterCounts.entries()].map(([cid, count]) =>
        CampaignCluster.updateOne(
          { _id: new Types.ObjectId(cid) },
          { $inc: { 'stats.queued': count } },
        ),
      ),
    );

    // ── 7. Transition LAUNCHING → ACTIVE ─────────────────────────────────────
    await Campaign.updateOne(
      { _id: campaignObjId },
      { $set: { status: 'ACTIVE', totalRecipients: messageOps.length } },
    );

    return {
      campaignId:          campaignId,
      status:              'ACTIVE',
      totalRecipients:     messageOps.length,
      dispatchJobsCreated: jobOps.length,
      scheduledAt,
      launchedAt:          now,
    };

  } catch (err) {
    // Roll back to READY_FOR_REVIEW so the campaign can be retried
    await Campaign.updateOne(
      { _id: campaignObjId, status: 'LAUNCHING' },
      { $set: { status: 'READY_FOR_REVIEW', launchedAt: null, scheduledAt: null } },
    ).catch(() => { /* best-effort — don't mask original error */ });
    throw err;
  }
}
