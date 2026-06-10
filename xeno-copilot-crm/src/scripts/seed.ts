/**
 * Raga brand seed script.
 * Creates 1000 customers, ~3000 orders, channel_stats, and 2 completed campaigns.
 * Run: npx ts-node src/scripts/seed.ts
 *
 * DESTRUCTIVE: drops existing customers, orders, channel_stats, and campaigns
 * before inserting new data. Safe to re-run.
 */

import 'dotenv/config';
import mongoose, { Types } from 'mongoose';
import { Customer } from '../models/Customer';
import { Order } from '../models/Order';
import { ChannelStats } from '../models/ChannelStats';
import { Campaign } from '../models/Campaign';
import { computeRFM } from '../services/rfm.service';

// ─── Config ───────────────────────────────────────────────────────────────────

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('[seed] MONGODB_URI is not set.');
  process.exit(1);
}

// ─── Random helpers ───────────────────────────────────────────────────────────

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randFloat(min: number, max: number, decimals = 0): number {
  const v = Math.random() * (max - min) + min;
  return decimals === 0 ? Math.round(v) : Math.round(v * 10 ** decimals) / 10 ** decimals;
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86400000);
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

const EMAIL_DOMAINS = ['gmail.com', 'yahoo.co.in', 'outlook.com', 'hotmail.com', 'rediffmail.com'];
const CATEGORIES    = ['kurta', 'saree', 'lehenga', 'anarkali', 'dupatta', 'salwar-kameez', 'accessories', 'jewelry', 'footwear', 'blouse'];
const ORDER_CHANNELS = ['ONLINE', 'OFFLINE'] as const;

let phoneCounter = 6000000000; // Start at +916000000000

function nextPhone(): string {
  phoneCounter += rand(1, 99);
  return `+91${phoneCounter}`;
}

function makeName(): { name: string; email: string | null } {
  const first = randFrom(FIRST_NAMES);
  const last  = randFrom(LAST_NAMES);
  const name  = `${first} ${last}`;
  // ~60% of customers have email
  const email = Math.random() < 0.6
    ? `${first.toLowerCase()}.${last.toLowerCase()}${rand(1, 99)}@${randFrom(EMAIL_DOMAINS)}`
    : null;
  return { name, email };
}

// ─── Order factory ────────────────────────────────────────────────────────────

interface OrderSeed {
  orderId: string;
  customerId: Types.ObjectId;
  customerPhone: string;
  amount: number;
  productCategory: string | null;
  orderDate: Date;
  channel: 'ONLINE' | 'OFFLINE';
  discountApplied: boolean;
}

let orderCounter = 100000;

function makeOrders(
  customerId: Types.ObjectId,
  phone: string,
  count: number,
  lastOrderDaysAgo: number,
  earliestDaysAgo: number,
  minAmount: number,
  maxAmount: number,
): OrderSeed[] {
  const orders: OrderSeed[] = [];

  // Place the most recent order at lastOrderDaysAgo; spread others backwards
  const spread = earliestDaysAgo - lastOrderDaysAgo;

  for (let i = 0; i < count; i++) {
    // Most recent first, spread backwards
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

// ─── Batch definitions ────────────────────────────────────────────────────────
// Designed so after quintile-based RFM computation, we get ~6 distinct segments.
//
// Batch A (100): CHAMPIONS target    — very recent, high frequency, high spend
// Batch B (150): PROMISING target    — recent, medium freq, medium spend
// Batch C (80):  AT_RISK target      — medium recency, high freq, high spend
// Batch D (70):  DORMANT_VIP target  — dormant, medium freq, high spend
// Batch E (280): LAPSED target       — very dormant, low freq, low spend
// Batch F (320): GENERAL target      — medium recency, medium freq, medium spend

interface BatchConfig {
  count: number;
  orderCount: [number, number];     // [min, max] orders per customer
  lastOrderDaysAgo: [number, number];
  earliestDaysAgo: number;
  amountRange: [number, number];
}

const BATCHES: BatchConfig[] = [
  // A: CHAMPIONS
  { count: 100, orderCount: [5, 8],  lastOrderDaysAgo: [1, 20],   earliestDaysAgo: 180,  amountRange: [4000, 12000] },
  // B: PROMISING
  { count: 150, orderCount: [2, 4],  lastOrderDaysAgo: [20, 45],  earliestDaysAgo: 365,  amountRange: [2000, 7000]  },
  // C: AT_RISK_LOYALISTS
  { count: 80,  orderCount: [5, 9],  lastOrderDaysAgo: [70, 100], earliestDaysAgo: 540,  amountRange: [3000, 10000] },
  // D: DORMANT_VIPS
  { count: 70,  orderCount: [3, 6],  lastOrderDaysAgo: [130, 175], earliestDaysAgo: 730, amountRange: [4000, 15000] },
  // E: LAPSED_LOW_VALUE
  { count: 280, orderCount: [1, 2],  lastOrderDaysAgo: [200, 400], earliestDaysAgo: 730, amountRange: [500, 2500]   },
  // F: GENERAL
  { count: 320, orderCount: [2, 4],  lastOrderDaysAgo: [50, 70],  earliestDaysAgo: 365,  amountRange: [1000, 4500]  },
];

// ─── Main ─────────────────────────────────────────────────────────────────────

async function seed(): Promise<void> {
  await mongoose.connect(MONGODB_URI!, { maxPoolSize: 5 });
  console.log('[seed] Connected to MongoDB.');

  // Clear existing data
  console.log('[seed] Clearing existing seed data...');
  await Promise.all([
    Customer.deleteMany({}),
    Order.deleteMany({}),
    ChannelStats.deleteMany({}),
    Campaign.deleteMany({}),
  ]);
  console.log('[seed] Collections cleared.');

  // Build customers and orders
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allCustomers: any[] = [];
  const allOrders:    OrderSeed[] = [];

  for (const batch of BATCHES) {
    for (let i = 0; i < batch.count; i++) {
      const phone = nextPhone();
      const { name, email } = makeName();
      const tags: string[] = Math.random() < 0.3 ? [randFrom(['vip', 'festive-buyer', 'new', 'loyal'])] : [];

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
      const orders = makeOrders(
        customerId,
        phone,
        orderCount,
        lastDaysAgo,
        batch.earliestDaysAgo,
        batch.amountRange[0],
        batch.amountRange[1],
      );
      allOrders.push(...orders);
    }
  }

  // Insert customers
  console.log(`[seed] Inserting ${allCustomers.length} customers...`);
  await Customer.insertMany(allCustomers, { ordered: false });

  // Insert orders in batches of 500
  console.log(`[seed] Inserting ${allOrders.length} orders...`);
  for (let i = 0; i < allOrders.length; i += 500) {
    await Order.insertMany(allOrders.slice(i, i + 500), { ordered: false });
  }

  // Compute RFM
  console.log('[seed] Computing RFM scores...');
  const { updated, reset } = await computeRFM();
  console.log(`[seed] RFM complete — updated: ${updated}, reset: ${reset}`);

  // ─── Seed channel_stats (simulates 2 prior completed campaigns) ───────────

  const channelStatsData = [
    // WIN_BACK campaigns (strong WhatsApp, weaker email)
    { channel: 'WHATSAPP', campaignType: 'WIN_BACK', totalSent: 1240, totalDelivered: 1187, totalOpened: 821, totalClicked: 293, totalConverted: 74, campaignCount: 3 },
    { channel: 'EMAIL',    campaignType: 'WIN_BACK', totalSent: 430,  totalDelivered: 419,  totalOpened: 89,  totalClicked: 21,  totalConverted: 9,  campaignCount: 2 },
    // REWARD_LOYAL campaigns
    { channel: 'WHATSAPP', campaignType: 'REWARD_LOYAL', totalSent: 580, totalDelivered: 563, totalOpened: 410, totalClicked: 198, totalConverted: 52, campaignCount: 2 },
    { channel: 'EMAIL',    campaignType: 'REWARD_LOYAL', totalSent: 210, totalDelivered: 205, totalOpened: 68,  totalClicked: 29,  totalConverted: 12, campaignCount: 2 },
    // UPSELL campaigns
    { channel: 'WHATSAPP', campaignType: 'UPSELL', totalSent: 380, totalDelivered: 367, totalOpened: 241, totalClicked: 89, totalConverted: 28, campaignCount: 1 },
    { channel: 'SMS',      campaignType: 'WIN_BACK', totalSent: 310, totalDelivered: 281, totalOpened: 0, totalClicked: 42, totalConverted: 18, campaignCount: 1 },
  ];

  const channelStatsDocs = channelStatsData.map((s) => {
    const deliveryRate   = s.totalSent     > 0 ? s.totalDelivered / s.totalSent     : 0;
    const openRate       = s.totalDelivered > 0 ? s.totalOpened   / s.totalDelivered : 0;
    const clickRate      = s.totalOpened   > 0 ? s.totalClicked   / s.totalOpened   : 0;
    const conversionRate = s.totalSent     > 0 ? s.totalConverted / s.totalSent     : 0;
    return {
      brandId:        null,
      channel:        s.channel,
      campaignType:   s.campaignType,
      totalSent:      s.totalSent,
      totalDelivered: s.totalDelivered,
      totalOpened:    s.totalOpened,
      totalClicked:   s.totalClicked,
      totalConverted: s.totalConverted,
      deliveryRate:   Math.round(deliveryRate   * 1000) / 1000,
      openRate:       Math.round(openRate       * 1000) / 1000,
      clickRate:      Math.round(clickRate      * 1000) / 1000,
      conversionRate: Math.round(conversionRate * 1000) / 1000,
      campaignCount:  s.campaignCount,
      lastUpdatedAt:  new Date(),
    };
  });

  await ChannelStats.insertMany(channelStatsDocs);
  console.log(`[seed] Inserted ${channelStatsDocs.length} channel_stats documents.`);

  // ─── Seed 2 completed campaigns ───────────────────────────────────────────

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
      totalRecipients:  440,
      scheduledAt:      null,
      launchedAt:       daysAgo(175),
      completedAt:      daysAgo(161),
      hmacSecret:       null,
      revenueEstimate: {
        min: 123200, max: 184800, conversionRate: 0.05, source: 'INDUSTRY_BENCHMARK',
      },
      aiReport: `## Campaign Performance Summary\n\n` +
        `The Win Back campaign (Dec 2025) reached **440 dormant customers** across WhatsApp and Email. ` +
        `WhatsApp achieved a **6.0% conversion rate** versus Email at **2.1%**. ` +
        `Dormant VIPs drove 71% of all conversions despite being only 29% of the audience. ` +
        `**Next step:** Prioritise WhatsApp for future win-back campaigns targeting the ₹3000+ AOV segment.`,
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

  // ─── Print segment distribution ───────────────────────────────────────────

  const distribution = await Customer.aggregate([
    { $match: { rfmSegment: { $ne: null } } },
    { $group: { _id: '$rfmSegment', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

  const noSegment = await Customer.countDocuments({ rfmSegment: null });
  const total     = await Customer.estimatedDocumentCount();
  const orderCount = await Order.estimatedDocumentCount();

  console.log('\n[seed] ─── Seed complete ───');
  console.log(`  Customers: ${total}`);
  console.log(`  Orders:    ${orderCount}`);
  console.log('  RFM segment distribution:');
  distribution.forEach((s) => console.log(`    ${s._id.padEnd(20)} ${s.count}`));
  if (noSegment > 0) console.log(`    (no segment)         ${noSegment}`);
  console.log('');

  await mongoose.disconnect();
}

seed().catch((err: Error) => {
  console.error('[seed] Fatal error:', err.message);
  process.exit(1);
});
