/**
 * seed.ts — Raga brand demo dataset.
 *
 * Creates:
 *   1 000 customers across 6 RFM-segment batches
 *   ~2 900 orders spread realistically over time
 *   RFM scores computed via rfm.service
 *   6 channel_stats rows (simulated historical performance)
 *   2 completed campaigns (Win Back + Reward Loyal)
 *   CampaignCluster + CampaignMessage + CommunicationEvent data for campaign 1
 *     → 20 messages (10 WHATSAPP + 10 EMAIL), full delivery-funnel simulation
 *
 * DESTRUCTIVE: drops customers, orders, campaigns, campaign_clusters,
 *              campaign_messages, communication_events, channel_stats before
 *              re-seeding. Safe to re-run.
 *
 * Run: npx ts-node src/scripts/seed.ts
 */

import 'dotenv/config';
import mongoose, { Types } from 'mongoose';
import { Customer }           from '../models/Customer';
import { Order }              from '../models/Order';
import { ChannelStats }       from '../models/ChannelStats';
import { Campaign }           from '../models/Campaign';
import { CampaignCluster }    from '../models/CampaignCluster';
import { CampaignMessage }    from '../models/CampaignMessage';
import { CommunicationEvent } from '../models/CommunicationEvent';
import { computeRFM }         from '../services/rfm.service';
import { sha256Hex }          from '../lib/crypto';

// ─── Startup guard ────────────────────────────────────────────────────────────

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('[seed] MONGODB_URI is not set.');
  process.exit(1);
}

// ─── Random helpers ───────────────────────────────────────────────────────────

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86_400_000);
}

function randFrom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ─── Name / phone generators ──────────────────────────────────────────────────

const FIRST_NAMES = [
  'Aarav', 'Aditya', 'Akash', 'Amit', 'Amrita', 'Ananya', 'Anjali', 'Arjun', 'Aryan',
  'Deepa', 'Deepak', 'Dev', 'Disha', 'Gaurav', 'Hardik', 'Isha', 'Ishaan', 'Kavita',
  'Karan', 'Kavya', 'Krish', 'Manish', 'Meera', 'Mohit', 'Nisha', 'Nitin', 'Pooja',
  'Priya', 'Rahul', 'Raj', 'Ravi', 'Rohit', 'Sachin', 'Sanjay', 'Sara', 'Shreya',
  'Shubham', 'Sneha', 'Sunita', 'Tanvi', 'Varsha', 'Vikram', 'Vivek', 'Yash', 'Zara',
  'Preethi', 'Lakshmi', 'Ramesh', 'Suresh', 'Geeta', 'Radha', 'Mohan', 'Seema',
];

const LAST_NAMES = [
  'Agarwal', 'Chaudhary', 'Dubey', 'Gupta', 'Iyer', 'Jain', 'Joshi', 'Kapoor',
  'Malhotra', 'Mehta', 'Mishra', 'Nair', 'Patel', 'Pillai', 'Rao', 'Reddy',
  'Sharma', 'Shah', 'Singh', 'Srivastava', 'Tiwari', 'Verma', 'Yadav', 'Bose',
  'Chatterjee', 'Das', 'Ghosh', 'Roy', 'Kumar', 'Mukherjee',
];

const EMAIL_DOMAINS  = ['gmail.com', 'yahoo.co.in', 'outlook.com', 'hotmail.com', 'rediffmail.com'];
const CATEGORIES     = ['kurta', 'saree', 'lehenga', 'anarkali', 'dupatta', 'salwar-kameez', 'accessories', 'jewelry', 'footwear', 'blouse'];
const ORDER_CHANNELS = ['ONLINE', 'OFFLINE'] as const;

let phoneCounter = 6_000_000_000;

function nextPhone(): string {
  phoneCounter += rand(1, 99);
  return `+91${phoneCounter}`;
}

function makeName(): { name: string; email: string | null } {
  const first = randFrom(FIRST_NAMES);
  const last  = randFrom(LAST_NAMES);
  const email = Math.random() < 0.6
    ? `${first.toLowerCase()}.${last.toLowerCase()}${rand(1, 99)}@${randFrom(EMAIL_DOMAINS)}`
    : null;
  return { name: `${first} ${last}`, email };
}

// ─── Order factory ────────────────────────────────────────────────────────────

interface OrderSeed {
  orderId:         string;
  customerId:      Types.ObjectId;
  customerPhone:   string;
  amount:          number;
  productCategory: string | null;
  orderDate:       Date;
  channel:         'ONLINE' | 'OFFLINE';
  discountApplied: boolean;
}

let orderCounter = 100_000;

function makeOrders(
  customerId:       Types.ObjectId,
  phone:            string,
  count:            number,
  lastOrderDaysAgo: number,
  earliestDaysAgo:  number,
  minAmount:        number,
  maxAmount:        number,
): OrderSeed[] {
  const orders: OrderSeed[] = [];
  const spread = earliestDaysAgo - lastOrderDaysAgo;

  for (let i = 0; i < count; i++) {
    const offset = i === 0
      ? lastOrderDaysAgo + rand(0, 5)
      : lastOrderDaysAgo + rand(10, spread);

    orderCounter += 1;
    orders.push({
      orderId:         `RG-${orderCounter}`,
      customerId,
      customerPhone:   phone,
      amount:          rand(minAmount, maxAmount),
      productCategory: Math.random() < 0.8 ? randFrom(CATEGORIES) : null,
      orderDate:       daysAgo(Math.min(offset, earliestDaysAgo)),
      channel:         randFrom(ORDER_CHANNELS),
      discountApplied: Math.random() < 0.3,
    });
  }
  return orders;
}

// ─── Segment-batch definitions ────────────────────────────────────────────────
// Designed so quintile-based RFM yields all 6 segments with realistic counts.
//
//  A (100) CHAMPIONS         — very recent, high freq, high spend
//  B (150) PROMISING         — recent, medium freq, medium spend
//  C  (80) AT_RISK_LOYALISTS — medium recency, high freq, high spend
//  D  (70) DORMANT_VIPS      — dormant, medium freq, high spend
//  E (280) LAPSED_LOW_VALUE  — very dormant, low freq, low spend
//  F (320) GENERAL           — medium recency, medium freq, medium spend

interface BatchConfig {
  count:            number;
  orderCount:       [number, number];
  lastOrderDaysAgo: [number, number];
  earliestDaysAgo:  number;
  amountRange:      [number, number];
}

const BATCHES: BatchConfig[] = [
  { count: 100, orderCount: [5, 8], lastOrderDaysAgo: [1,   20],  earliestDaysAgo: 180, amountRange: [4000, 12000] },
  { count: 150, orderCount: [2, 4], lastOrderDaysAgo: [20,  45],  earliestDaysAgo: 365, amountRange: [2000,  7000] },
  { count: 80,  orderCount: [5, 9], lastOrderDaysAgo: [70, 100],  earliestDaysAgo: 540, amountRange: [3000, 10000] },
  { count: 70,  orderCount: [3, 6], lastOrderDaysAgo: [130, 175], earliestDaysAgo: 730, amountRange: [4000, 15000] },
  { count: 280, orderCount: [1, 2], lastOrderDaysAgo: [200, 400], earliestDaysAgo: 730, amountRange: [500,   2500] },
  { count: 320, orderCount: [2, 4], lastOrderDaysAgo: [50,  70],  earliestDaysAgo: 365, amountRange: [1000,  4500] },
];

// ─── Delivery-funnel simulation for campaign 1 ────────────────────────────────
//
// Creates CampaignCluster, CampaignMessage, and CommunicationEvent documents
// for the seeded Win-Back campaign, so getCampaignStats() returns real numbers.
//
// Funnel for each cluster (10 messages each):
//   DORMANT_VIPS  (WHATSAPP):  10 SENT, 9 DELIVERED, 7 OPENED, 4 CLICKED, 2 CONVERTED
//   LAPSED_LOW_VALUE (EMAIL):  10 SENT, 9 DELIVERED, 5 OPENED, 2 CLICKED, 1 CONVERTED

// Which events a message at each status level generates
type FunnelTier = {
  finalStatus: 'SENT' | 'DELIVERED' | 'OPENED' | 'CLICKED' | 'CONVERTED';
  events:      Array<'SENT' | 'DELIVERED' | 'OPENED' | 'CLICKED' | 'CONVERTED'>;
};

const WA_TIERS: FunnelTier[] = [
  { finalStatus: 'CONVERTED', events: ['SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'CONVERTED'] },
  { finalStatus: 'CONVERTED', events: ['SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'CONVERTED'] },
  { finalStatus: 'CLICKED',   events: ['SENT', 'DELIVERED', 'OPENED', 'CLICKED'] },
  { finalStatus: 'CLICKED',   events: ['SENT', 'DELIVERED', 'OPENED', 'CLICKED'] },
  { finalStatus: 'OPENED',    events: ['SENT', 'DELIVERED', 'OPENED'] },
  { finalStatus: 'OPENED',    events: ['SENT', 'DELIVERED', 'OPENED'] },
  { finalStatus: 'OPENED',    events: ['SENT', 'DELIVERED', 'OPENED'] },
  { finalStatus: 'DELIVERED', events: ['SENT', 'DELIVERED'] },
  { finalStatus: 'DELIVERED', events: ['SENT', 'DELIVERED'] },
  { finalStatus: 'SENT',      events: ['SENT'] },
];

const EMAIL_TIERS: FunnelTier[] = [
  { finalStatus: 'CONVERTED', events: ['SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'CONVERTED'] },
  { finalStatus: 'CLICKED',   events: ['SENT', 'DELIVERED', 'OPENED', 'CLICKED'] },
  { finalStatus: 'OPENED',    events: ['SENT', 'DELIVERED', 'OPENED'] },
  { finalStatus: 'OPENED',    events: ['SENT', 'DELIVERED', 'OPENED'] },
  { finalStatus: 'OPENED',    events: ['SENT', 'DELIVERED', 'OPENED'] },
  { finalStatus: 'DELIVERED', events: ['SENT', 'DELIVERED'] },
  { finalStatus: 'DELIVERED', events: ['SENT', 'DELIVERED'] },
  { finalStatus: 'DELIVERED', events: ['SENT', 'DELIVERED'] },
  { finalStatus: 'DELIVERED', events: ['SENT', 'DELIVERED'] },
  { finalStatus: 'SENT',      events: ['SENT'] },
];

const STATUS_TIMESTAMP_FIELD: Record<string, string> = {
  SENT:      'sentAt',
  DELIVERED: 'deliveredAt',
  OPENED:    'openedAt',
  CLICKED:   'clickedAt',
  CONVERTED: 'convertedAt',
};

interface CustomerLite {
  _id:   Types.ObjectId;
  phone: string;
  email: string | null;
  name:  string;
}

// Returns the number of CampaignMessage documents actually inserted so the
// caller can write that count back to Campaign.totalRecipients.
async function seedCampaignDeliveryData(campaign1Id: Types.ObjectId): Promise<number> {
  // Fetch up to 10 customers from each target segment (they exist after computeRFM).
  // sort(_id:1) makes the selection deterministic across re-runs on the same dataset.
  const dormantVips = await Customer.find(
    { rfmSegment: 'DORMANT_VIPS' },
    { _id: 1, phone: 1, email: 1, name: 1 },
  ).sort({ _id: 1 }).limit(10).lean() as CustomerLite[];

  const lapsedLow = await Customer.find(
    { rfmSegment: 'LAPSED_LOW_VALUE' },
    { _id: 1, phone: 1, email: 1, name: 1 },
  ).sort({ _id: 1 }).limit(10).lean() as CustomerLite[];

  if (dormantVips.length === 0 && lapsedLow.length === 0) {
    console.warn('[seed] Warning: no segmented customers found — skipping delivery simulation.');
    return 0;
  }

  // Create 2 CampaignClusters ────────────────────────────────────────────────
  const cluster1Id = new Types.ObjectId();
  const cluster2Id = new Types.ObjectId();

  // Clamp to however many customers are actually available.
  const waCustomers = dormantVips.slice(0, Math.min(dormantVips.length, WA_TIERS.length));
  const emCustomers = lapsedLow.slice(0, Math.min(lapsedLow.length, EMAIL_TIERS.length));
  const waTiers     = WA_TIERS.slice(0, waCustomers.length);
  const emTiers     = EMAIL_TIERS.slice(0, emCustomers.length);

  // Pre-aggregate stats from the tiers we will actually use so the CampaignCluster
  // stats field is always consistent with the inserted CommunicationEvent documents.
  function countTierField(
    tiers: FunnelTier[],
    field: 'SENT' | 'DELIVERED' | 'OPENED' | 'CLICKED' | 'CONVERTED',
  ): number {
    return tiers.filter((t) => t.events.includes(field)).length;
  }

  const WA_STATS = {
    queued:    waCustomers.length,
    sent:      countTierField(waTiers, 'SENT'),
    delivered: countTierField(waTiers, 'DELIVERED'),
    failed:    0,
    opened:    countTierField(waTiers, 'OPENED'),
    clicked:   countTierField(waTiers, 'CLICKED'),
    converted: countTierField(waTiers, 'CONVERTED'),
  };
  const EM_STATS = {
    queued:    emCustomers.length,
    sent:      countTierField(emTiers, 'SENT'),
    delivered: countTierField(emTiers, 'DELIVERED'),
    failed:    0,
    opened:    countTierField(emTiers, 'OPENED'),
    clicked:   countTierField(emTiers, 'CLICKED'),
    converted: countTierField(emTiers, 'CONVERTED'),
  };

  await CampaignCluster.insertMany([
    {
      _id:             cluster1Id,
      campaignId:      campaign1Id,
      clusterLabel:    'DORMANT_VIPS',
      clusterDescription: 'High-value customers who drifted away — strong win-back potential',
      rfmPatternDescription: 'R≤2, F≥3, M≥3 — lapsed but loyal historically',
      memberCount:     10,
      assignedChannel: 'WHATSAPP',
      channelConfidence: 'HIGH',
      message: {
        subject:   null,
        body:      'Hi {name}, we miss you! Come back and discover our new collection. Shop now: {ctaUrl}',
        ctaText:   'Shop Now',
        ctaUrl:    'https://raga.example.com/win-back',
        rationale: 'WhatsApp preferred for high-engagement dormant VIPs',
      },
      stats:     WA_STATS,
      createdAt: daysAgo(175),
    },
    {
      _id:             cluster2Id,
      campaignId:      campaign1Id,
      clusterLabel:    'LAPSED_LOW_VALUE',
      clusterDescription: 'Occasional buyers who last shopped over 6 months ago',
      rfmPatternDescription: 'R≤2, F≤2 — infrequent and dormant',
      memberCount:     10,
      assignedChannel: 'EMAIL',
      channelConfidence: 'MEDIUM',
      message: {
        subject:   'We have a special offer waiting for you',
        body:      'Dear {name}, it\'s been a while! We have curated a special collection just for you. Click here: {ctaUrl}',
        ctaText:   'See Collection',
        ctaUrl:    'https://raga.example.com/win-back-email',
        rationale: 'Email used as secondary channel for lower-value segment',
      },
      stats:     EM_STATS,
      createdAt: daysAgo(175),
    },
  ]);

  // Build CampaignMessage + CommunicationEvent docs ──────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messageDocs:  any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eventDocs:    any[] = [];

  const buildClusterMessages = (
    customers:  CustomerLite[],
    clusterId:  Types.ObjectId,
    channel:    'WHATSAPP' | 'EMAIL',
    tiers:      FunnelTier[],
    baseOffset: number,  // days ago for base timestamp
  ) => {
    customers.forEach((customer, i) => {
      const tier      = tiers[i];
      const messageId = new Types.ObjectId();
      const recipient = channel === 'EMAIL'
        ? (customer.email ?? customer.phone)
        : customer.phone;

      // Timestamps spread over the campaign window (daysAgo(baseOffset) → daysAgo(baseOffset-14))
      const sentTime      = daysAgo(baseOffset - rand(0, 3));
      const deliveredTime = new Date(sentTime.getTime() + rand(1, 30) * 60_000);     // 1–30 min after sent
      const openedTime    = new Date(deliveredTime.getTime() + rand(10, 120) * 60_000); // 10–120 min after delivered
      const clickedTime   = new Date(openedTime.getTime() + rand(1, 20) * 60_000);
      const convertedTime = new Date(clickedTime.getTime() + rand(5, 60) * 60_000);

      const tsMap: Record<string, Date> = {
        SENT:      sentTime,
        DELIVERED: deliveredTime,
        OPENED:    openedTime,
        CLICKED:   clickedTime,
        CONVERTED: convertedTime,
      };

      // Build CampaignMessage with final status + all reached timestamps
      const msgDoc: Record<string, unknown> = {
        _id:               messageId,
        campaignId:        campaign1Id,
        clusterId,
        customerId:        customer._id,
        channel,
        recipient,
        clickTrackingPath: `/api/v1/track/click/${messageId.toHexString()}`,
        ctaUrl:            channel === 'EMAIL'
          ? 'https://raga.example.com/win-back-email'
          : 'https://raga.example.com/win-back',
        status:            tier.finalStatus,
        queuedAt:          daysAgo(baseOffset + 1),
        sentAt:            null,
        deliveredAt:       null,
        openedAt:          null,
        clickedAt:         null,
        convertedAt:       null,
        failedAt:          null,
        failureReason:     null,
        createdAt:         daysAgo(baseOffset + 1),
      };

      for (const ev of tier.events) {
        const field = STATUS_TIMESTAMP_FIELD[ev];
        if (field) msgDoc[field] = tsMap[ev];
      }

      messageDocs.push(msgDoc);

      // Build one CommunicationEvent per funnel step reached
      for (const ev of tier.events) {
        eventDocs.push({
          messageId,
          campaignId:        campaign1Id,
          customerId:        customer._id,
          clusterId,
          channel,
          eventType:         ev,
          eventTimestamp:    tsMap[ev],
          receivedAt:        new Date(tsMap[ev].getTime() + rand(100, 500)),
          providerMessageId: `MOCK-${messageId.toHexString().slice(0, 8)}-${ev}`,
          metadata:          null,
          idempotencyKey:    sha256Hex(`${messageId.toHexString()}:${ev}`),
        });
      }
    });
  };

  buildClusterMessages(waCustomers, cluster1Id, 'WHATSAPP', waTiers, 173);
  buildClusterMessages(emCustomers, cluster2Id, 'EMAIL',    emTiers, 170);

  // Insert in batches
  await CampaignMessage.insertMany(messageDocs, { ordered: false });
  console.log(`[seed] Inserted ${messageDocs.length} campaign_messages for campaign 1.`);

  await CommunicationEvent.insertMany(eventDocs, { ordered: false });
  console.log(`[seed] Inserted ${eventDocs.length} communication_events for campaign 1.`);

  return messageDocs.length;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function seed(): Promise<void> {
  await mongoose.connect(MONGODB_URI!, { maxPoolSize: 5 });
  console.log('[seed] Connected to MongoDB.');

  // Clear all relevant collections ───────────────────────────────────────────
  console.log('[seed] Clearing existing seed data...');
  await Promise.all([
    Customer.deleteMany({}),
    Order.deleteMany({}),
    ChannelStats.deleteMany({}),
    Campaign.deleteMany({}),
    CampaignCluster.deleteMany({}),
    CampaignMessage.deleteMany({}),
    CommunicationEvent.deleteMany({}),
  ]);
  console.log('[seed] Collections cleared.');

  // Build customers and orders ────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allCustomers: any[] = [];
  const allOrders:    OrderSeed[] = [];

  for (const batch of BATCHES) {
    for (let i = 0; i < batch.count; i++) {
      const phone = nextPhone();
      const { name, email } = makeName();
      const tags: string[] = Math.random() < 0.3
        ? [randFrom(['vip', 'festive-buyer', 'new', 'loyal'])]
        : [];

      const customerId = new Types.ObjectId();
      allCustomers.push({
        _id:            customerId,
        brandId:        null,
        phone,
        name,
        email,
        source:         'CSV' as const,
        tags,
        optOutChannels: [],
        createdAt:      daysAgo(rand(400, 800)),
        updatedAt:      new Date(),
        lastOrderAt:    null,
        totalOrders:    0,
        totalSpend:     0,
        rfmR:           null,
        rfmF:           null,
        rfmM:           null,
        rfmSegment:     null,
      });

      const orderCount  = rand(batch.orderCount[0], batch.orderCount[1]);
      const lastDaysAgo = rand(batch.lastOrderDaysAgo[0], batch.lastOrderDaysAgo[1]);
      allOrders.push(...makeOrders(
        customerId, phone, orderCount, lastDaysAgo,
        batch.earliestDaysAgo, batch.amountRange[0], batch.amountRange[1],
      ));
    }
  }

  // Insert customers
  console.log(`[seed] Inserting ${allCustomers.length} customers...`);
  await Customer.insertMany(allCustomers, { ordered: false });

  // Insert orders in 500-row batches
  console.log(`[seed] Inserting ${allOrders.length} orders...`);
  for (let i = 0; i < allOrders.length; i += 500) {
    await Order.insertMany(allOrders.slice(i, i + 500), { ordered: false });
  }

  // Compute RFM ───────────────────────────────────────────────────────────────
  console.log('[seed] Computing RFM scores...');
  const { updated, reset } = await computeRFM();
  console.log(`[seed] RFM complete — updated: ${updated}, reset: ${reset}`);

  // Seed channel_stats (6 rows, 2 prior completed campaigns) ─────────────────
  const channelStatsData = [
    { channel: 'WHATSAPP', campaignType: 'WIN_BACK',      totalSent: 1240, totalDelivered: 1187, totalOpened: 821,  totalClicked: 293, totalConverted: 74,  campaignCount: 3 },
    { channel: 'EMAIL',    campaignType: 'WIN_BACK',      totalSent: 430,  totalDelivered: 419,  totalOpened: 89,   totalClicked: 21,  totalConverted: 9,   campaignCount: 2 },
    { channel: 'WHATSAPP', campaignType: 'REWARD_LOYAL',  totalSent: 580,  totalDelivered: 563,  totalOpened: 410,  totalClicked: 198, totalConverted: 52,  campaignCount: 2 },
    { channel: 'EMAIL',    campaignType: 'REWARD_LOYAL',  totalSent: 210,  totalDelivered: 205,  totalOpened: 68,   totalClicked: 29,  totalConverted: 12,  campaignCount: 2 },
    { channel: 'WHATSAPP', campaignType: 'UPSELL',        totalSent: 380,  totalDelivered: 367,  totalOpened: 241,  totalClicked: 89,  totalConverted: 28,  campaignCount: 1 },
    { channel: 'SMS',      campaignType: 'WIN_BACK',      totalSent: 310,  totalDelivered: 281,  totalOpened: 0,    totalClicked: 42,  totalConverted: 18,  campaignCount: 1 },
  ];

  const channelStatsDocs = channelStatsData.map((s) => ({
    brandId:        null,
    channel:        s.channel,
    campaignType:   s.campaignType,
    totalSent:      s.totalSent,
    totalDelivered: s.totalDelivered,
    totalOpened:    s.totalOpened,
    totalClicked:   s.totalClicked,
    totalConverted: s.totalConverted,
    deliveryRate:   s.totalSent      > 0 ? Math.round(s.totalDelivered / s.totalSent      * 1000) / 1000 : 0,
    openRate:       s.totalDelivered > 0 ? Math.round(s.totalOpened   / s.totalDelivered * 1000) / 1000 : 0,
    // SMS has no open-tracking: fall back to delivered as the denominator so
    // the 42 clicks are not silently discarded.
    clickRate:      s.totalOpened    > 0
      ? Math.round(s.totalClicked / s.totalOpened   * 1000) / 1000
      : (s.totalDelivered > 0 ? Math.round(s.totalClicked / s.totalDelivered * 1000) / 1000 : 0),
    conversionRate: s.totalSent      > 0 ? Math.round(s.totalConverted / s.totalSent      * 1000) / 1000 : 0,
    campaignCount:  s.campaignCount,
    lastUpdatedAt:  new Date(),
  }));

  await ChannelStats.insertMany(channelStatsDocs);
  console.log(`[seed] Inserted ${channelStatsDocs.length} channel_stats documents.`);

  // Seed 2 completed campaigns ───────────────────────────────────────────────
  const campaign1Id = new Types.ObjectId();
  const campaign2Id = new Types.ObjectId();

  await Campaign.insertMany([
    {
      _id:             campaign1Id,
      brandId:         null,
      name:            'Win Back — Dormant 90d — Dec 2025',
      goalText:        'Win back customers who haven\'t purchased in 90 days',
      goalType:        'WIN_BACK',
      status:          'COMPLETED',
      intentType:      'WIN_BACK',
      intentParameters: {
        dormancyDays: 90, minOrders: 2, maxOrders: null,
        minSpend: null, productCategory: null, acquisitionChannel: null,
      },
      audienceFilter:   { lastOrderAt: { $lt: daysAgo(90) }, totalOrders: { $gte: 2 } },
      audienceSnapshot: {
        count: 447, medianAOV: 2800,
        channelMix: { WHATSAPP: 312, EMAIL: 135 }, savedAt: daysAgo(175),
      },
      totalRecipients:  null,   // set below after seedCampaignDeliveryData() runs
      scheduledAt:      null,
      launchedAt:       daysAgo(175),
      completedAt:      daysAgo(161),
      hmacSecret:       null,
      revenueEstimate: {
        min: 123200, max: 184800, conversionRate: 0.05, source: 'INDUSTRY_BENCHMARK',
      },
      aiReport: `## Campaign Performance Summary\n\n` +
        `The Win Back campaign (Dec 2025) reached **20 dormant customers** across WhatsApp and Email. ` +
        `WhatsApp achieved a **20% conversion rate** versus Email at **10%**. ` +
        `Dormant VIPs drove 67% of all conversions despite being 50% of the audience. ` +
        `**Next step:** Prioritise WhatsApp for future win-back campaigns targeting the ₹4000+ AOV segment.`,
      aiReportGeneratedAt: daysAgo(159),
      createdAt:        daysAgo(176),
      draftSavedAt:     daysAgo(175),
    },
    {
      _id:             campaign2Id,
      brandId:         null,
      name:            'Reward Loyal — Champions — Mar 2026',
      goalText:        'Reward our top customers with an exclusive offer',
      goalType:        'REWARD_LOYAL',
      status:          'COMPLETED',
      intentType:      'REWARD_LOYAL',
      intentParameters: {
        dormancyDays: null, minOrders: 5, maxOrders: null,
        minSpend: 20000, productCategory: null, acquisitionChannel: null,
      },
      audienceFilter:   { rfmSegment: { $in: ['CHAMPIONS'] } },
      audienceSnapshot: {
        count: 100, medianAOV: 6500,
        channelMix: { WHATSAPP: 78, EMAIL: 22 }, savedAt: daysAgo(90),
      },
      totalRecipients:  98,
      scheduledAt:      null,
      launchedAt:       daysAgo(90),
      completedAt:      daysAgo(76),
      hmacSecret:       null,
      revenueEstimate: {
        min: 45000, max: 65000, conversionRate: 0.07, source: 'HISTORICAL_DATA',
      },
      aiReport: `## Campaign Performance Summary\n\n` +
        `The Champions reward campaign reached **98 top-tier customers**. ` +
        `WhatsApp delivered an outstanding **8.2% conversion rate**. ` +
        `Average order value among converters was ₹7,400 — **14% above forecast**. ` +
        `**Next step:** Extend the loyalty programme to the AT_RISK_LOYALISTS segment before they churn.`,
      aiReportGeneratedAt: daysAgo(74),
      createdAt:        daysAgo(91),
      draftSavedAt:     daysAgo(90),
    },
  ]);
  console.log('[seed] Inserted 2 completed campaigns.');

  // Seed delivery funnel data for campaign 1 ─────────────────────────────────
  console.log('[seed] Seeding delivery events for campaign 1...');
  const campaign1Messages = await seedCampaignDeliveryData(campaign1Id);

  // Write the actual message count back — this must happen after seeding so the
  // value is always consistent with what's in campaign_messages.
  await Campaign.updateOne(
    { _id: campaign1Id },
    { $set: { totalRecipients: campaign1Messages } },
  );

  // ─── Summary ──────────────────────────────────────────────────────────────

  const [distribution, noSegment, totalCustomers, totalOrders, totalMessages, totalEvents] =
    await Promise.all([
      Customer.aggregate([
        { $match: { rfmSegment: { $ne: null } } },
        { $group: { _id: '$rfmSegment', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Customer.countDocuments({ rfmSegment: null }),
      Customer.estimatedDocumentCount(),
      Order.estimatedDocumentCount(),
      CampaignMessage.estimatedDocumentCount(),
      CommunicationEvent.estimatedDocumentCount(),
    ]);

  console.log('\n[seed] ─── Seed complete ───────────────────────────────────────');
  console.log(`  Customers:            ${totalCustomers}`);
  console.log(`  Orders:               ${totalOrders}`);
  console.log(`  CampaignMessages:     ${totalMessages}`);
  console.log(`  CommunicationEvents:  ${totalEvents}`);
  console.log('  RFM segment distribution:');
  (distribution as Array<{ _id: string; count: number }>)
    .forEach((s) => console.log(`    ${s._id.padEnd(22)} ${s.count}`));
  if (noSegment > 0) console.log(`    (no segment)           ${noSegment}`);
  console.log('');

  await mongoose.disconnect();
}

seed().catch((err: Error) => {
  console.error('[seed] Fatal error:', err.message);
  process.exit(1);
});
