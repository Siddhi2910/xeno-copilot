/**
 * smoke-test.ts — End-to-end service-layer smoke test.
 *
 * Tests every major code path without requiring the HTTP server to be running.
 * Calls service functions directly so the full stack (MongoDB ↔ service ↔ model)
 * is exercised.
 *
 * Sections:
 *   1  Seed data integrity      — counts, RFM distribution, campaign existence
 *   2  Audience service         — buildAudienceFilter, queryAudienceStats
 *   3  Campaign service         — getCampaignStats on seeded campaign
 *   4  Campaign launch flow     — create test campaign → launchCampaign → verify
 *   5  Callback flow            — SENT/DELIVERED/OPENED events, HMAC, idempotency
 *   6  Stats aggregation        — getCampaignStats on test campaign post-callbacks
 *   7  Error-path guards        — wrong HMAC, unknown messageId, duplicate event
 *
 * Cleanup: all test documents (customers, campaign, clusters, messages, jobs,
 *          events) are deleted after the run regardless of pass/fail.
 *
 * Run: npx ts-node src/scripts/smoke-test.ts
 *
 * Prerequisites:
 *   1. MONGODB_URI set in .env
 *   2. npx ts-node src/scripts/seed.ts has been run at least once
 */

import 'dotenv/config';
import mongoose, { Types } from 'mongoose';

import { Customer }           from '../models/Customer';
import { Campaign }           from '../models/Campaign';
import { CampaignCluster }    from '../models/CampaignCluster';
import { CampaignMessage }    from '../models/CampaignMessage';
import { DispatchJob }        from '../models/DispatchJob';
import { CommunicationEvent } from '../models/CommunicationEvent';

import { buildAudienceFilter, queryAudienceStats } from '../services/audience.service';
import { getCampaignStats }                         from '../services/campaign.service';
import { launchCampaign }                           from '../services/dispatch.service';
import { handleDeliveryCallback }                   from '../services/callback.service';
import { hmacSign, generateSecret }                 from '../lib/crypto';

// ─── Config ───────────────────────────────────────────────────────────────────

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('[smoke] MONGODB_URI is not set.');
  process.exit(1);
}

// ─── Test infrastructure ──────────────────────────────────────────────────────

interface CheckResult {
  name:    string;
  passed:  boolean;
  message: string;
}

const results: CheckResult[] = [];

function check(name: string, passed: boolean, message: string): void {
  results.push({ name, passed, message });
  const icon = passed ? '✓' : '✗';
  console.log(`  ${icon} ${name}${passed ? '' : ` — FAIL: ${message}`}`);
}

async function runCheck(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    check(name, true, 'ok');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    check(name, false, msg);
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

// ─── Test-data sentinels ──────────────────────────────────────────────────────
// Unique phones guarantee no collision with seed data (seed starts at +916000000000).

const TEST_PHONES = [
  '+911111111111',
  '+911111111112',
  '+911111111113',
  '+911111111114',
  '+911111111115',
];

// IDs collected during the run so cleanup can target them precisely
const testCustomerIds:  Types.ObjectId[] = [];
let   testCampaignId:   Types.ObjectId | null = null;

// ─── Setup: create isolated test customers ────────────────────────────────────

async function createTestCustomers(): Promise<void> {
  // Remove any leftover test customers from a previous aborted run
  await Customer.deleteMany({ phone: { $in: TEST_PHONES } });

  const docs = TEST_PHONES.map((phone, i) => ({
    _id:            new Types.ObjectId(),
    phone,
    name:           `Smoke Test Customer ${i + 1}`,
    email:          `smoketest${i + 1}@example.com`,
    source:         'API' as const,
    tags:           ['smoke-test'],
    optOutChannels: [],
    createdAt:      new Date(),
    updatedAt:      new Date(),
    lastOrderAt:    null,
    totalOrders:    0,
    totalSpend:     0,
    rfmR:           null,
    rfmF:           null,
    rfmM:           null,
    rfmSegment:     null,
  }));

  await Customer.insertMany(docs);
  docs.forEach((d) => testCustomerIds.push(d._id));
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

async function cleanup(): Promise<void> {
  const ops: Promise<unknown>[] = [
    Customer.deleteMany({ phone: { $in: TEST_PHONES } }),
  ];

  if (testCampaignId) {
    ops.push(
      Campaign.deleteOne({ _id: testCampaignId }),
      CampaignCluster.deleteMany({ campaignId: testCampaignId }),
      CampaignMessage.deleteMany({ campaignId: testCampaignId }),
      DispatchJob.deleteMany({ campaignId: testCampaignId }),
      CommunicationEvent.deleteMany({ campaignId: testCampaignId }),
    );
  }

  await Promise.all(ops);
  console.log('\n[smoke] Test data cleaned up.');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  await mongoose.connect(MONGODB_URI!, { maxPoolSize: 3 });
  console.log('[smoke] Connected to MongoDB.\n');

  // ── Section 1: Seed data integrity ─────────────────────────────────────────
  console.log('[smoke] ── Section 1: Seed data integrity ──────────────────────');

  await runCheck('Customer count ≥ 1000', async () => {
    const count = await Customer.countDocuments();
    assert(count >= 1000, `Expected ≥ 1000, got ${count}`);
  });

  await runCheck('Order count ≥ 2000', async () => {
    const count = await mongoose.connection.collection('orders').countDocuments();
    assert(count >= 2000, `Expected ≥ 2000, got ${count}`);
  });

  await runCheck('All 6 RFM segments present', async () => {
    const segments = await Customer.distinct('rfmSegment', { rfmSegment: { $ne: null } }) as string[];
    const expected = ['CHAMPIONS', 'PROMISING', 'AT_RISK_LOYALISTS', 'DORMANT_VIPS', 'LAPSED_LOW_VALUE', 'GENERAL'];
    const missing  = expected.filter((s) => !segments.includes(s));
    assert(missing.length === 0, `Missing segments: ${missing.join(', ')}`);
  });

  await runCheck('CHAMPIONS count between 50–250', async () => {
    const count = await Customer.countDocuments({ rfmSegment: 'CHAMPIONS' });
    assert(count >= 50 && count <= 250, `Got ${count}`);
  });

  await runCheck('2 COMPLETED campaigns exist', async () => {
    const count = await Campaign.countDocuments({ status: 'COMPLETED' });
    assert(count >= 2, `Expected ≥ 2 COMPLETED campaigns, got ${count}`);
  });

  await runCheck('CampaignCluster docs exist for campaign 1', async () => {
    // Use the Win Back campaign by name — not findOne({ status: 'COMPLETED' }) which
    // could non-deterministically return campaign 2 (Reward Loyal) that has no clusters.
    const campaign1 = await Campaign.findOne({ name: /Win Back/ }).lean();
    assert(campaign1 !== null, 'Win Back campaign not found');
    const clusterCount = await CampaignCluster.countDocuments({ campaignId: campaign1!._id });
    assert(clusterCount >= 1, `Expected ≥ 1 cluster for campaign 1, got ${clusterCount}`);
  });

  await runCheck('CampaignMessage docs exist for campaign 1', async () => {
    // Same deterministic lookup — avoids flaky findOne returning the wrong campaign.
    const campaign1 = await Campaign.findOne({ name: /Win Back/ }).lean();
    assert(campaign1 !== null, 'Win Back campaign not found');
    const msgCount = await CampaignMessage.countDocuments({ campaignId: campaign1!._id });
    assert(msgCount >= 1, `Expected ≥ 1 message for campaign 1, got ${msgCount}`);
  });

  await runCheck('CommunicationEvent docs exist', async () => {
    const count = await CommunicationEvent.countDocuments();
    assert(count >= 1, `Expected ≥ 1 communication event, got ${count}`);
  });

  // ── Section 2: Audience service ────────────────────────────────────────────
  console.log('\n[smoke] ── Section 2: Audience service ────────────────────────');

  await runCheck('buildAudienceFilter(WIN_BACK_DORMANT) returns a filter', async () => {
    const filter = await buildAudienceFilter('WIN_BACK_DORMANT', { dormancyDays: 90 });
    assert(typeof filter === 'object' && filter !== null, 'Expected object');
    assert(!('$where' in filter), 'Filter must not contain $where');
  });

  await runCheck('queryAudienceStats returns count > 0 for WIN_BACK_DORMANT', async () => {
    const filter = await buildAudienceFilter('WIN_BACK_DORMANT', { dormancyDays: 60 });
    const stats  = await queryAudienceStats(filter);
    assert(stats.count > 0, `Expected count > 0, got ${stats.count}`);
    assert(typeof stats.medianAOV === 'number', 'medianAOV should be a number');
    assert(typeof stats.channelMix === 'object', 'channelMix should be an object');
  });

  await runCheck('queryAudienceStats returns clusters array', async () => {
    const filter = await buildAudienceFilter('REWARD_TOP_SPENDERS', { topPercentile: 20 });
    const stats  = await queryAudienceStats(filter);
    assert(Array.isArray(stats.clusters), 'clusters should be an array');
  });

  await runCheck('buildAudienceFilter rejects $ injection in parameters', async () => {
    let threw = false;
    try {
      await buildAudienceFilter('WIN_BACK_DORMANT', { '$where': 'malicious' } as Record<string, unknown>);
    } catch {
      threw = true;
    }
    assert(threw, 'Expected AppError for $ key injection — none thrown');
  });

  // ── Section 3: Campaign stats on seeded data ───────────────────────────────
  console.log('\n[smoke] ── Section 3: Campaign stats on seeded data ───────────');

  await runCheck('getCampaignStats returns non-zero delivered for campaign 1', async () => {
    const campaign1 = await Campaign.findOne({ status: 'COMPLETED', name: /Win Back/ }).lean();
    assert(campaign1 !== null, 'Win Back campaign not found');
    const stats = await getCampaignStats(campaign1!._id.toHexString());
    assert(stats.stats.sent >= 1,      `Expected sent ≥ 1, got ${stats.stats.sent}`);
    assert(stats.stats.delivered >= 1, `Expected delivered ≥ 1, got ${stats.stats.delivered}`);
    assert(stats.stats.opened >= 1,    `Expected opened ≥ 1, got ${stats.stats.opened}`);
    assert(stats.rates.deliveryRate > 0, 'deliveryRate should be > 0');
  });

  await runCheck('getCampaignStats deliveryRate ≤ 100', async () => {
    const campaign1 = await Campaign.findOne({ status: 'COMPLETED', name: /Win Back/ }).lean();
    const stats = await getCampaignStats(campaign1!._id.toHexString());
    assert(stats.rates.deliveryRate <= 100, `deliveryRate ${stats.rates.deliveryRate} > 100`);
    assert(stats.rates.openRate     <= 100, `openRate ${stats.rates.openRate} > 100`);
    assert(stats.rates.clickRate    <= 100, `clickRate ${stats.rates.clickRate} > 100`);
  });

  // ── Section 4: Full launch flow ────────────────────────────────────────────
  console.log('\n[smoke] ── Section 4: Full launch flow ────────────────────────');

  // Create isolated test customers before launch tests
  await createTestCustomers();

  await runCheck('Test customers inserted (5 rows)', async () => {
    const count = await Customer.countDocuments({ phone: { $in: TEST_PHONES } });
    assert(count === 5, `Expected 5 test customers, got ${count}`);
  });

  // Create campaign with everything launchCampaign needs
  let hmacSecret = '';
  let testClusterId: Types.ObjectId | null = null;

  await runCheck('Create READY_FOR_REVIEW campaign', async () => {
    testCampaignId = new Types.ObjectId();

    await Campaign.create({
      _id:              testCampaignId,
      name:             'Smoke Test Campaign — DO NOT USE',
      goalText:         'Smoke test: validate the full launch and callback flow end-to-end',
      goalType:         'WIN_BACK',
      status:           'READY_FOR_REVIEW',
      intentType:       'WIN_BACK',
      intentParameters: {
        dormancyDays: null, minOrders: null, maxOrders: null,
        minSpend: null, productCategory: null, acquisitionChannel: null,
      },
      audienceFilter:   { phone: { $in: TEST_PHONES } },
      audienceSnapshot: {
        count: 5, medianAOV: 1500,
        channelMix: { WHATSAPP: 5 }, savedAt: new Date(),
      },
      totalRecipients:  5,
    });

    // Create one cluster — clusterLabel is intentionally 'GENERAL' so
    // launchCampaign() falls back to defaultCluster for all test customers
    // (their rfmSegment is null → no match → fallback).
    testClusterId = new Types.ObjectId();
    await CampaignCluster.create({
      _id:             testClusterId,
      campaignId:      testCampaignId,
      clusterLabel:    'GENERAL',
      clusterDescription: 'Smoke-test default cluster',
      memberCount:     5,
      assignedChannel: 'WHATSAPP',
      channelConfidence: 'LOW',
      message: {
        subject:  null,
        body:     'Hi {name}, this is a smoke-test message. Visit: {ctaUrl}',
        ctaText:  'Visit',
        ctaUrl:   'https://example.com/smoke',
        rationale: null,
      },
    });

    const campaign = await Campaign.findById(testCampaignId).lean();
    assert(campaign?.status === 'READY_FOR_REVIEW', `Status: ${campaign?.status}`);
  });

  await runCheck('launchCampaign transitions campaign to ACTIVE', async () => {
    assert(testCampaignId !== null, 'testCampaignId not set');
    const result = await launchCampaign(testCampaignId!.toHexString());
    assert(result.status === 'ACTIVE', `Expected ACTIVE, got ${result.status}`);
    assert(result.totalRecipients === 5, `Expected 5 recipients, got ${result.totalRecipients}`);
    assert(result.dispatchJobsCreated === 5, `Expected 5 jobs, got ${result.dispatchJobsCreated}`);
  });

  await runCheck('5 CampaignMessage docs created', async () => {
    assert(testCampaignId !== null, 'testCampaignId not set');
    const count = await CampaignMessage.countDocuments({ campaignId: testCampaignId });
    assert(count === 5, `Expected 5 messages, got ${count}`);
  });

  await runCheck('5 DispatchJob docs created', async () => {
    assert(testCampaignId !== null, 'testCampaignId not set');
    const count = await DispatchJob.countDocuments({ campaignId: testCampaignId });
    assert(count === 5, `Expected 5 dispatch jobs, got ${count}`);
  });

  await runCheck('CampaignCluster.stats.queued = 5 after launch', async () => {
    assert(testClusterId !== null, 'testClusterId not set');
    const cluster = await CampaignCluster.findById(testClusterId).lean();
    assert(cluster?.stats.queued === 5, `Expected queued=5, got ${cluster?.stats.queued}`);
  });

  await runCheck('All messages in QUEUED status', async () => {
    assert(testCampaignId !== null, 'testCampaignId not set');
    const nonQueued = await CampaignMessage.countDocuments({
      campaignId: testCampaignId,
      status:     { $ne: 'QUEUED' },
    });
    assert(nonQueued === 0, `${nonQueued} messages not in QUEUED status`);
  });

  await runCheck('hmacSecret persisted on campaign', async () => {
    assert(testCampaignId !== null, 'testCampaignId not set');
    const campaign = await Campaign.findById(testCampaignId).lean();
    assert(typeof campaign?.hmacSecret === 'string' && campaign.hmacSecret.length === 64,
      `hmacSecret: ${campaign?.hmacSecret}`);
    hmacSecret = campaign!.hmacSecret!;
  });

  // ── Section 5: Callback flow ───────────────────────────────────────────────
  console.log('\n[smoke] ── Section 5: Callback flow ───────────────────────────');

  // Pick the first two messages — msg1 for the happy-path funnel, msg2 for FAILED tests
  let msg1Id = '';
  let msg2Id = '';

  await runCheck('Resolve first two test messages', async () => {
    assert(testCampaignId !== null, 'testCampaignId not set');
    const msgs = await CampaignMessage.find({ campaignId: testCampaignId })
      .sort({ _id: 1 }).limit(2).lean();
    assert(msgs.length >= 2, `Expected ≥ 2 messages, got ${msgs.length}`);
    msg1Id = msgs[0]._id.toHexString();
    msg2Id = msgs[1]._id.toHexString();
  });

  await runCheck('SENT callback accepted with correct HMAC', async () => {
    assert(!!hmacSecret && !!msg1Id, 'Prerequisites not met');
    const payload = {
      messageId: msg1Id,
      eventType: 'SENT' as const,
      timestamp: new Date().toISOString(),
      providerId: 'MOCK-PROVIDER-001',
    };
    const rawBody  = JSON.stringify(payload);
    const sig      = `sha256=${hmacSign(hmacSecret, rawBody)}`;
    const result   = await handleDeliveryCallback(rawBody, sig, payload);
    assert(result.accepted === true, `Expected accepted=true, got ${JSON.stringify(result)}`);
    assert(typeof result.eventId === 'string', 'Expected eventId string');
  });

  await runCheck('CampaignMessage status advances to SENT', async () => {
    assert(!!msg1Id, 'msg1Id not set');
    const msg = await CampaignMessage.findById(new Types.ObjectId(msg1Id)).lean();
    assert(msg?.status === 'SENT', `Expected SENT, got ${msg?.status}`);
    assert(msg?.sentAt instanceof Date, 'sentAt should be a Date');
  });

  await runCheck('CampaignCluster.stats.sent incremented to 1', async () => {
    assert(testClusterId !== null, 'testClusterId not set');
    const cluster = await CampaignCluster.findById(testClusterId).lean();
    assert((cluster?.stats.sent ?? 0) >= 1, `Expected sent ≥ 1, got ${cluster?.stats.sent}`);
  });

  await runCheck('Duplicate SENT callback rejected (idempotency)', async () => {
    assert(!!hmacSecret && !!msg1Id, 'Prerequisites not met');
    const payload = {
      messageId: msg1Id,
      eventType: 'SENT' as const,
      timestamp: new Date().toISOString(),
    };
    const rawBody = JSON.stringify(payload);
    const sig     = `sha256=${hmacSign(hmacSecret, rawBody)}`;
    const result  = await handleDeliveryCallback(rawBody, sig, payload);
    assert(result.accepted === false, 'Expected duplicate to be rejected');
    assert(result.reason === 'DUPLICATE_EVENT', `Expected DUPLICATE_EVENT, got ${result.reason}`);
  });

  await runCheck('DELIVERED callback accepted', async () => {
    assert(!!hmacSecret && !!msg1Id, 'Prerequisites not met');
    const payload = {
      messageId: msg1Id,
      eventType: 'DELIVERED' as const,
      timestamp: new Date().toISOString(),
    };
    const rawBody = JSON.stringify(payload);
    const sig     = `sha256=${hmacSign(hmacSecret, rawBody)}`;
    const result  = await handleDeliveryCallback(rawBody, sig, payload);
    assert(result.accepted === true, `Expected accepted=true, got ${JSON.stringify(result)}`);
  });

  await runCheck('OPENED callback accepted', async () => {
    assert(!!hmacSecret && !!msg1Id, 'Prerequisites not met');
    const payload = {
      messageId: msg1Id,
      eventType: 'OPENED' as const,
      timestamp: new Date().toISOString(),
    };
    const rawBody = JSON.stringify(payload);
    const sig     = `sha256=${hmacSign(hmacSecret, rawBody)}`;
    const result  = await handleDeliveryCallback(rawBody, sig, payload);
    assert(result.accepted === true, `Expected accepted=true`);
  });

  // ── Section 6: Error-path guards ───────────────────────────────────────────
  console.log('\n[smoke] ── Section 6: Error-path guards ───────────────────────');

  await runCheck('Wrong HMAC signature → 401 UNAUTHORIZED', async () => {
    assert(!!msg1Id, 'msg1Id not set');
    const payload = {
      messageId: msg1Id,
      eventType: 'CLICKED' as const,
      timestamp: new Date().toISOString(),
    };
    const rawBody    = JSON.stringify(payload);
    const wrongSig   = `sha256=${hmacSign(generateSecret(32), rawBody)}`; // wrong secret
    let threw401 = false;
    try {
      await handleDeliveryCallback(rawBody, wrongSig, payload);
    } catch (err: unknown) {
      const e = err as { statusCode?: number; code?: string };
      threw401 = e?.statusCode === 401 || e?.code === 'UNAUTHORIZED';
    }
    assert(threw401, 'Expected AppError 401 for wrong HMAC');
  });

  await runCheck('Unknown messageId → 404 NOT_FOUND', async () => {
    const fakeId  = new Types.ObjectId().toHexString();
    const payload = {
      messageId: fakeId,
      eventType: 'SENT' as const,
      timestamp: new Date().toISOString(),
    };
    const rawBody = JSON.stringify(payload);
    const sig     = `sha256=${hmacSign('any-secret', rawBody)}`;
    let threw404  = false;
    try {
      await handleDeliveryCallback(rawBody, sig, payload);
    } catch (err: unknown) {
      const e = err as { statusCode?: number; code?: string };
      threw404 = e?.statusCode === 404 || e?.code === 'NOT_FOUND';
    }
    assert(threw404, 'Expected AppError 404 for unknown messageId');
  });

  await runCheck('launchCampaign on wrong-status campaign → 422', async () => {
    // testCampaignId is now ACTIVE — can't launch again
    assert(testCampaignId !== null, 'testCampaignId not set');
    let threw422 = false;
    try {
      await launchCampaign(testCampaignId!.toHexString());
    } catch (err: unknown) {
      const e = err as { statusCode?: number };
      threw422 = e?.statusCode === 422;
    }
    assert(threw422, 'Expected 422 when launching already-ACTIVE campaign');
  });

  await runCheck('FAILED callbacks are non-idempotent (two accepted)', async () => {
    // Use msg2 — it has never received a callback, so it is in QUEUED state.
    // Using msg1 (OPENED) would silently regress its status to FAILED because
    // callback.service.ts uses { failedAt: null } with no rank check for FAILED.
    assert(!!hmacSecret && !!msg2Id, 'Prerequisites not met');
    const makePayload = () => ({
      messageId: msg2Id,
      eventType: 'FAILED' as const,
      timestamp: new Date().toISOString(),
      metadata:  { reason: 'DELIVERY_ERROR' },
    });

    const p1 = makePayload();
    const r1body = JSON.stringify(p1);
    const r1 = await handleDeliveryCallback(r1body, `sha256=${hmacSign(hmacSecret, r1body)}`, p1);

    const p2 = makePayload();
    const r2body = JSON.stringify(p2);
    const r2 = await handleDeliveryCallback(r2body, `sha256=${hmacSign(hmacSecret, r2body)}`, p2);

    assert(r1.accepted === true, 'First FAILED should be accepted');
    assert(r2.accepted === true, 'Second FAILED should also be accepted (non-idempotent)');
  });

  // ── Section 7: Stats aggregation after callbacks ───────────────────────────
  console.log('\n[smoke] ── Section 7: Stats aggregation ───────────────────────');

  await runCheck('getCampaignStats shows correct funnel after callbacks', async () => {
    assert(testCampaignId !== null, 'testCampaignId not set');
    const stats = await getCampaignStats(testCampaignId!.toHexString());
    // msg1 got SENT → DELIVERED → OPENED; remaining 4 still QUEUED
    assert(stats.stats.sent      >= 1, `sent should be ≥ 1, got ${stats.stats.sent}`);
    assert(stats.stats.delivered >= 1, `delivered should be ≥ 1, got ${stats.stats.delivered}`);
    assert(stats.stats.opened    >= 1, `opened should be ≥ 1, got ${stats.stats.opened}`);
    assert(stats.stats.queued    === 5, `queued should still be 5 (set at launch), got ${stats.stats.queued}`);
  });

  await runCheck('deliveryRate and openRate are plausible percentages', async () => {
    assert(testCampaignId !== null, 'testCampaignId not set');
    const stats = await getCampaignStats(testCampaignId!.toHexString());
    assert(stats.rates.deliveryRate >= 0 && stats.rates.deliveryRate <= 100,
      `deliveryRate out of range: ${stats.rates.deliveryRate}`);
    assert(stats.rates.openRate >= 0 && stats.rates.openRate <= 100,
      `openRate out of range: ${stats.rates.openRate}`);
  });

  // ── Cleanup ────────────────────────────────────────────────────────────────
  await cleanup();

  // ── Summary ────────────────────────────────────────────────────────────────
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const total  = results.length;

  console.log('\n[smoke] ─────────────────────────────────────────────────────────');
  console.log(`[smoke] Results: ${passed}/${total} passed${failed > 0 ? `, ${failed} FAILED` : ''}`);

  if (failed > 0) {
    console.log('\n[smoke] Failed checks:');
    results
      .filter((r) => !r.passed)
      .forEach((r) => console.log(`  ✗ ${r.name}: ${r.message}`));
  }

  console.log('');
  await mongoose.disconnect();

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (err: Error) => {
  console.error('[smoke] Fatal error:', err.message);
  await cleanup().catch(() => {});
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
