# Xeno Copilot — Database Schema

**Version:** 1.0  
**Date:** June 2026  
**Status:** Approved for Implementation  
**Database:** MongoDB Atlas M0  
**Builds on:** PRD v1.1 · SYSTEM_ARCHITECTURE.md v1.1

---

## Table of Contents

1. [Design Principles](#1-design-principles)
2. [Entity Relationship Map](#2-entity-relationship-map)
3. [Collection: customers](#3-collection-customers)
4. [Collection: orders](#4-collection-orders)
5. [Collection: campaigns](#5-collection-campaigns)
6. [Collection: campaign_clusters](#6-collection-campaign_clusters)
7. [Collection: campaign_messages](#7-collection-campaign_messages)
8. [Collection: communication_events](#8-collection-communication_events)
9. [Collection: dispatch_jobs](#9-collection-dispatch_jobs)
10. [Collection: ai_logs](#10-collection-ai_logs)
11. [Collection: channel_stats](#11-collection-channel_stats)
12. [Collection: import_jobs](#12-collection-import_jobs)
13. [Multi-Tenancy Strategy](#13-multi-tenancy-strategy)
14. [Index Summary](#14-index-summary)
15. [Storage Estimates](#15-storage-estimates)

---

## 1. Design Principles

### 1.1 Document Orientation

MongoDB's document model is used purposefully, not as a drop-in for relational tables. Fields are embedded when they are always accessed together and never need to be queried independently. Fields are referenced (by ObjectId) when they are accessed independently or when the child collection grows unboundedly.

Key embedding decisions:
- `campaigns.audienceSnapshot` — always displayed with the campaign record, small fixed size
- `campaigns.revenueEstimate` — always displayed with the campaign, two fields
- `campaign_clusters.message` — always displayed with the cluster, small fixed size
- `campaign_clusters.stats` — always updated and displayed together, five counters

Key reference decisions:
- `campaign_messages` is a separate collection from `campaigns` — one campaign can have 10,000+ messages; embedding would create documents exceeding MongoDB's 16MB document limit
- `communication_events` is separate from `campaign_messages` — one message can generate 5–7 events; the event log grows unboundedly per message
- `dispatch_jobs` is separate — consumed by a different service with different access patterns

### 1.2 Denormalization Policy

Selected fields are intentionally denormalized for read performance. Denormalized fields are always:
- Marked with a `// denormalized` comment in the schema
- Set at write time from the canonical source
- Never updated after creation (immutable denormalization)

Specific denormalizations:
- `orders.customerPhone` — denormalized from `customers.phone` for fast ingestion joins
- `campaign_messages.ctaUrl` — denormalized from `campaign_clusters.message.ctaUrl` for single-query click tracking redirects
- `campaign_messages.clusterId`, `communication_events.campaignId`, `communication_events.clusterId` — denormalized to eliminate joins in analytics aggregations

### 1.3 Computed Fields

RFM fields on `customers` (`rfmR`, `rfmF`, `rfmM`, `rfmSegment`, `lastOrderAt`, `totalOrders`, `totalSpend`) are computed values derived from the `orders` collection. They are stored on the customer document for fast query performance. They are always recomputed in full after any ingestion event. They must never be manually edited — treat them as a materialized view.

### 1.4 Multi-Tenancy Readiness

Every collection contains a `brandId` field reserved for multi-tenancy. In V1, this field is present in the schema but not used in any query. When multi-tenancy is activated, a middleware layer adds `brandId` to every query, and a compound index on `{brandId, <primary_query_field>}` replaces the current single-field index. No schema migration is required.

### 1.5 Status Enums Are Uppercase Strings

All status and type enum fields use SCREAMING_SNAKE_CASE strings (`DRAFT`, `ACTIVE`, `WIN_BACK`). Lowercase is avoided because mixed-case comparisons are a common source of bugs when reading MongoDB documents in a JavaScript runtime where `status === "active"` and `status === "ACTIVE"` both look plausible.

---

## 2. Entity Relationship Map

```
                    ┌─────────────────────┐
                    │      customers       │
                    │  _id (PK)           │
                    │  phone (unique)      │
                    └──────────┬──────────┘
                               │ 1:N
              ┌────────────────┼────────────────┐
              ▼                ▼                 ▼
        ┌──────────┐   ┌──────────────┐  ┌─────────────────────┐
        │  orders  │   │   campaign   │  │  campaign_messages   │
        │  _id(PK) │   │   _messages  │  │  (via customerId)   │
        │ customerId│  │   _id (PK)   │  └─────────────────────┘
        │ (FK→cust)│   │  customerId  │
        └──────────┘   │  (FK→cust)  │
                       │  campaignId  │◄──────┐
                       │  clusterId   │       │
                       └──────┬───────┘       │
                              │ 1:N           │
                              ▼               │
                   ┌─────────────────────┐    │
                   │ communication_events│    │
                   │  _id (PK)           │    │
                   │  messageId (FK→msg) │    │
                   │  campaignId (denorm)│    │
                   └─────────────────────┘    │
                                              │
 ┌──────────────────┐                         │
 │    campaigns      │─────────────────────────┘
 │  _id (PK)        │
 │  status          │
 └────────┬─────────┘
          │ 1:N (per campaign)
          ├──────────────────────────────────┐
          ▼                                  ▼
┌──────────────────────┐         ┌────────────────────┐
│  campaign_clusters    │         │   dispatch_jobs     │
│  _id (PK)            │         │  _id (PK)           │
│  campaignId (FK→camp)│         │  campaignId (FK)    │
│  message {}          │         │  messageId (FK→msg) │
│  stats {}            │         │  status             │
└──────────────────────┘         └────────────────────┘

Standalone collections (no FK relationships):
┌──────────────┐  ┌───────────────┐  ┌──────────────┐
│   ai_logs    │  │ channel_stats │  │ import_jobs  │
│  (campaignId │  │  (aggregated  │  │  (no FKs)    │
│  optional FK)│  │   totals)     │  │              │
└──────────────┘  └───────────────┘  └──────────────┘
```

**Referential integrity:** MongoDB does not enforce foreign key constraints. All FK relationships listed above are maintained at the application layer. The ingestion service validates that `orders.customerPhone` maps to an existing customer before writing. The campaign launch service validates that all cluster and message records are created before marking the campaign as ACTIVE.

---

## 3. Collection: `customers`

### Purpose

The canonical customer record for a retail brand. Holds profile data, communication preferences, and RFM-derived behavioral scores. The primary input to audience segmentation and campaign targeting.

### Schema

```javascript
{
  // Identity
  _id:              ObjectId,       // MongoDB auto-generated PK
  brandId:          ObjectId,       // reserved for multi-tenancy — not active in V1

  // Profile
  phone:            String,         // E.164 format (+919876543210) — primary key in retail
  name:             String,         // display name, from ingestion
  email:            String,         // optional, used for email channel
  source:           String,         // "CSV" | "API" — how the customer was ingested
  tags:             [String],       // freeform labels (e.g., "vip", "festive-buyer")

  // Communication preferences
  optOutChannels:   [String],       // channels customer has opted out of: ["WHATSAPP","EMAIL","SMS"]
                                    // Enforced at dispatch. Never send to opted-out channel.

  // Timestamps
  createdAt:        Date,           // when the customer record was first created
  updatedAt:        Date,           // last modification to any field

  // Computed by RFM job — full recompute after every ingestion, never manually edited
  lastOrderAt:      Date,           // max(orderDate) across all orders — null if no orders
  totalOrders:      Number,         // count of distinct orders — 0 if no orders
  totalSpend:       Number,         // sum of order amounts — 0 if no orders

  // RFM scores — quintile 1 (worst) to 5 (best)
  rfmR:             Number,         // Recency score. 5 = bought recently. 1 = bought long ago.
  rfmF:             Number,         // Frequency score. 5 = many purchases. 1 = single purchase.
  rfmM:             Number,         // Monetary score. 5 = highest spend. 1 = lowest spend.
  rfmSegment:       String          // derived segment label from RFM lookup table
                                    // "CHAMPIONS" | "PROMISING" | "AT_RISK_LOYALISTS" |
                                    // "DORMANT_VIPS" | "LAPSED_LOW_VALUE" | "GENERAL"
}
```

### Validation Rules

| Field | Rule | Reason |
|---|---|---|
| `phone` | Required. Matches `/^\+[1-9]\d{7,14}$/` (E.164). | Phone is the join key for orders and the primary delivery address. Invalid phones cause silent delivery failure. |
| `email` | Optional. Matches RFC 5322 email format if present. | Email is optional but must be valid if used as a campaign channel. |
| `source` | Required. Enum: `["CSV", "API"]`. | Tracks ingestion method for debugging and audit. |
| `optOutChannels` | Array. Each element in `["WHATSAPP", "EMAIL", "SMS"]`. | Invalid channel names break opt-out enforcement silently. |
| `tags` | Array of strings. Max 20 tags per customer. Each tag max 50 chars. | Unbounded arrays degrade query performance. |
| `rfmR`, `rfmF`, `rfmM` | Integer 1–5 if set. Null if customer has no orders. | Scores outside 1–5 corrupt the cluster lookup table assignment. |
| `rfmSegment` | Enum of valid segment labels if set. Null if no orders. | Invalid segment label causes segmentation queries to miss customers. |
| `totalOrders` | Integer ≥ 0. | Negative values indicate data corruption. |
| `totalSpend` | Number ≥ 0. | Negative values indicate unhandled return data. |

### Indexes

```
{ phone: 1 }                              UNIQUE — primary lookup by phone
{ lastOrderAt: 1 }                        WIN_BACK queries (customers dormant > N days)
{ rfmSegment: 1 }                         Segment list views, behavioral filter queries
{ lastOrderAt: 1, totalOrders: 1 }        COMPOUND — WIN_BACK + minOrders filter
                                          (most common audience query pattern)
{ rfmSegment: 1, lastOrderAt: 1 }         COMPOUND — segment + recency filter
                                          (AT_RISK_LOYALISTS dormant > 60 days)
{ email: 1 }                              SPARSE — email campaign targeting, not all
                                          customers have email, sparse avoids null entries
```

**Index strategy note:** The `{ lastOrderAt, totalOrders }` compound index covers the most common audience query (WIN_BACK: `lastOrderAt < D AND totalOrders >= N`). MongoDB will use this index for prefix queries on `lastOrderAt` alone as well, making the standalone `lastOrderAt` index redundant — but it is kept for the Audience Health dashboard aggregation which queries `lastOrderAt` without `totalOrders`.

### Sample Document

```json
{
  "_id": "64a7b2c3d4e5f6a7b8c9d0e1",
  "brandId": null,
  "phone": "+919876543210",
  "name": "Priya Sharma",
  "email": "priya.sharma@gmail.com",
  "source": "CSV",
  "tags": ["festive-buyer", "kurta"],
  "optOutChannels": [],
  "createdAt": "2024-01-15T08:30:00.000Z",
  "updatedAt": "2024-04-20T14:22:00.000Z",
  "lastOrderAt": "2024-01-20T11:15:00.000Z",
  "totalOrders": 4,
  "totalSpend": 12400,
  "rfmR": 2,
  "rfmF": 3,
  "rfmM": 4,
  "rfmSegment": "AT_RISK_LOYALISTS"
}
```

**Reading this document:** Priya bought 4 times (F=3, mid-frequency), spent ₹12,400 total (M=4, high spend), but her last purchase was in January — ~5 months ago (R=2, poor recency). She is classified as AT_RISK_LOYALISTS: was a loyal buyer, now drifting. Win-back campaign with a soft re-engagement message is the recommended action.

### Primary Query Patterns

```
// 1. Lookup by phone (customer detail, ingestion deduplication)
db.customers.findOne({ phone: "+919876543210" })
// → uses: unique phone index

// 2. WIN_BACK audience query (dormant > 90 days, at least 2 orders)
db.customers.find({
  lastOrderAt: { $lt: new Date(Date.now() - 90 * 86400000) },
  totalOrders: { $gte: 2 },
  optOutChannels: { $nin: ["WHATSAPP"] }
})
// → uses: { lastOrderAt, totalOrders } compound index

// 3. Audience Health dormancy buckets (Audience Health dashboard)
db.customers.aggregate([
  { $group: {
    _id: {
      $switch: {
        branches: [
          { case: { $gte: ["$lastOrderAt", thirtyDaysAgo] }, then: "ACTIVE" },
          { case: { $gte: ["$lastOrderAt", ninetyDaysAgo] }, then: "AT_RISK" }
        ],
        default: "DORMANT"
      }
    },
    count: { $sum: 1 }
  }}
])
// → full collection scan — acceptable, result is cached for dashboard refresh

// 4. VIP segment (REWARD_LOYAL — top 10% by spend)
db.customers.find({ rfmSegment: "CHAMPIONS" })
// → uses: rfmSegment index

// 5. AT_RISK_LOYALISTS who are about to go dormant
db.customers.find({
  rfmSegment: "AT_RISK_LOYALISTS",
  lastOrderAt: { $lt: sixtyDaysAgo, $gte: ninetyDaysAgo }
})
// → uses: { rfmSegment, lastOrderAt } compound index
```

---

## 4. Collection: `orders`

### Purpose

The complete purchase history of all customers. The primary source for RFM computation, conversion attribution, and product category-based audience targeting. Orders are ingested via CSV or API and linked to customers via phone number at ingestion time.

### Schema

```javascript
{
  // Identity
  _id:                   ObjectId,    // MongoDB auto-generated PK
  brandId:               ObjectId,    // reserved for multi-tenancy — not active in V1

  // Order identity
  orderId:               String,      // unique identifier from the source system (POS/e-commerce)
                                      // used for deduplication on re-import
  // Customer link
  customerId:            ObjectId,    // FK → customers._id (resolved at ingestion from customerPhone)
  customerPhone:         String,      // denormalized — the join key used during CSV ingestion
                                      // kept for debugging and re-ingestion without customer lookup

  // Order data
  amount:                Number,      // order value in base currency (INR paise or INR — be consistent)
  productCategory:       String,      // category of primary product (e.g., "kurta", "saree", "accessories")
  orderDate:             Date,        // the date of the transaction (from source system, not ingestion time)
  channel:               String,      // "ONLINE" | "OFFLINE" — where the purchase occurred
  discountApplied:       Boolean,     // whether a discount code or offer was used

  // Attribution — set by conversion detection job, null until attributed
  campaignAttributedTo:  ObjectId,    // FK → campaigns._id — last-touch, 14-day attribution window
                                      // null = organic purchase or unattributed

  // Timestamps
  createdAt:             Date         // when this order document was ingested into Xeno Copilot
                                      // NOT the order date — that is orderDate above
}
```

### Validation Rules

| Field | Rule | Reason |
|---|---|---|
| `orderId` | Required. Unique within the collection. Max 100 chars. | Duplicate order IDs corrupt RFM totals if re-imported. |
| `customerId` | Required. Must be a valid ObjectId. | Orphaned orders cannot be attributed or analyzed. |
| `customerPhone` | Required. E.164 format. | Used for re-ingestion and debugging when customerId lookup fails. |
| `amount` | Required. Number ≥ 0. | Returns (negative amounts) are not supported in V1 — they would subtract from `totalSpend`. Negative amounts are rejected at ingestion with an import error. |
| `orderDate` | Required. Valid Date. Must not be in the future. Must not be before 2010-01-01. | Future dates corrupt recency scoring. Pre-2010 dates indicate bad data. |
| `channel` | Required. Enum: `["ONLINE", "OFFLINE"]`. | Invalid channel values break category-based audience filters. |
| `productCategory` | Optional. String. Max 100 chars. | Used for UPSELL/CROSS_SELL segment queries. Null means uncategorised. |

### Indexes

```
{ orderId: 1 }                             UNIQUE — deduplication on re-import
{ customerId: 1 }                          Customer order history queries
{ orderDate: 1 }                           Time-range queries, RFM aggregation
{ customerId: 1, orderDate: -1 }           COMPOUND — customer timeline (most recent first)
                                           Used by customer detail page
{ productCategory: 1 }                    Category-based audience segmentation
{ campaignAttributedTo: 1 }               SPARSE — attribution analysis, unattributed orders
                                           have null, sparse index skips nulls
```

**Note on `{ customerPhone, orderDate }` from architecture:** This compound index was specified in the architecture for ingestion joins. At ingestion, however, the join is done at the application layer (look up customer by phone, then write the order with `customerId`). The phone index is on the `customers` collection. This index on `orders` is therefore redundant and removed. The canonical join key after ingestion is `customerId`, not `customerPhone`.

### Sample Document

```json
{
  "_id": "64b8c3d4e5f6a7b8c9d0e1f2",
  "brandId": null,
  "orderId": "RG-2024-00451",
  "customerId": "64a7b2c3d4e5f6a7b8c9d0e1",
  "customerPhone": "+919876543210",
  "amount": 3200,
  "productCategory": "kurta",
  "orderDate": "2024-01-20T11:15:00.000Z",
  "channel": "OFFLINE",
  "discountApplied": false,
  "campaignAttributedTo": null,
  "createdAt": "2024-06-01T09:00:00.000Z"
}
```

### Primary Query Patterns

```
// 1. Customer order history (customer detail page)
db.orders.find({ customerId: ObjectId("...") }).sort({ orderDate: -1 })
// → uses: { customerId, orderDate } compound index

// 2. RFM aggregation (run after each ingestion)
db.orders.aggregate([
  { $group: {
    _id: "$customerId",
    lastOrderAt: { $max: "$orderDate" },
    totalOrders: { $sum: 1 },
    totalSpend: { $sum: "$amount" }
  }}
])
// → full collection scan on orders — acceptable as a background job

// 3. Deduplication check on re-import
db.orders.findOne({ orderId: "RG-2024-00451" })
// → uses: unique orderId index

// 4. Conversion detection (conversion job every 30 min)
db.orders.find({
  customerId: { $in: [customerIdArray] },
  orderDate: { $gte: campaign.launchedAt, $lt: attributionCutoff },
  campaignAttributedTo: null
})
// → uses: customerId index for $in lookup

// 5. Category-based audience (UPSELL: customers who bought kurta but not saree)
db.orders.aggregate([
  { $match: { productCategory: "kurta" } },
  { $group: { _id: "$customerId" } }
])
// → uses: productCategory index
```

---

## 5. Collection: `campaigns`

### Purpose

The master record for every campaign created in Xeno Copilot. Holds the campaign's lifecycle status, AI-generated content, audience definition, revenue estimates, and post-campaign analytics. Also serves as the recovery point for browser refresh during campaign creation (DRAFT state).

### Schema

```javascript
{
  // Identity
  _id:              ObjectId,       // MongoDB auto-generated PK
  brandId:          ObjectId,       // reserved for multi-tenancy — not active in V1

  // Basic metadata
  name:             String,         // human-readable campaign name (auto-generated or user-provided)
  goalText:         String,         // the raw natural-language goal the marketer typed
                                    // e.g., "Win back dormant customers"
  goalType:         String,         // classified intent: "WIN_BACK" | "REWARD_LOYAL" | "UPSELL" |
                                    // "CROSS_SELL" | "ANNOUNCEMENT" | "CUSTOM"

  // Lifecycle status
  status:           String,         // "DRAFT" | "READY_FOR_REVIEW" | "LAUNCHING" |
                                    // "ACTIVE" | "COMPLETED" | "FAILED"
                                    // See state machine in SYSTEM_ARCHITECTURE §4.4

  // Audience definition — written at DRAFT (after Human Gate 2)
  intentType:       String,         // same as goalType — redundant, kept for clarity
  intentParameters: {               // the resolved parameters extracted by LLM Call 1
    dormancyDays:   Number,         // null if not a WIN_BACK / REACTIVATE campaign
    minOrders:      Number,         // minimum order count filter
    maxOrders:      Number,         // maximum order count filter (null = no upper bound)
    minSpend:       Number,         // minimum total spend filter
    productCategory: String,        // product category filter (null = all categories)
    acquisitionChannel: String      // online/offline filter (null = both)
  },
  audienceFilter:   Object,         // the safe MongoDB query object generated by the CRM whitelist
                                    // NOT LLM output — generated by application code from intentParameters
                                    // Stored as a snapshot for audit trail and re-targeting
  audienceSnapshot: {               // aggregated stats of the audience at the time of Gate 2
    count:          Number,         // total customers matched
    medianAOV:      Number,         // median order value of matched customers
    channelMix:     Object,         // e.g., { "WHATSAPP": 820, "EMAIL": 427 }
    savedAt:        Date            // when the snapshot was captured
  },

  // Execution
  totalRecipients:  Number,         // final count of customers messaged at launch
                                    // may differ from audienceSnapshot.count if opt-outs removed at launch
  scheduledAt:      Date,           // when campaign was scheduled (null = launched immediately)
  launchedAt:       Date,           // when LAUNCHING status was set and fan-out began
  completedAt:      Date,           // when attribution window closed or all messages terminated

  // Security
  hmacSecret:       String,         // 32-byte hex secret generated at launch
                                    // used to sign and verify Channel Service callbacks
                                    // never sent to the frontend

  // Revenue
  revenueEstimate: {
    min:            Number,         // lower bound in INR
    max:            Number,         // upper bound in INR
    conversionRate: Number,         // assumed conversion rate (decimal, e.g., 0.05 = 5%)
    source:         String          // "INDUSTRY_BENCHMARK" | "HISTORICAL_DATA"
                                    // always visible to marketer — never hidden
  },

  // AI report
  aiReport:         String,         // markdown narrative generated by LLM Call 5 at T+48h
  aiReportGeneratedAt: Date,        // when the report was generated (null until generated)

  // Timestamps
  createdAt:        Date,           // when the campaign document was first created
  draftSavedAt:     Date            // when DRAFT was first persisted (after Gate 2 confirmation)
                                    // used to calculate how long the campaign stayed in DRAFT
}
```

### Validation Rules

| Field | Rule | Reason |
|---|---|---|
| `name` | Required. String. Max 200 chars. | Used in campaign list display. |
| `goalText` | Required. String. Min 10 chars, max 500 chars. | Too short = likely garbage input. Too long = LLM prompt overflow risk. |
| `goalType` | Required. Enum: `["WIN_BACK","REWARD_LOYAL","UPSELL","CROSS_SELL","ANNOUNCEMENT","CUSTOM"]`. | Invalid type breaks the whitelist query mapping. |
| `status` | Required. Enum: `["DRAFT","READY_FOR_REVIEW","LAUNCHING","ACTIVE","COMPLETED","FAILED"]`. | Status drives business logic in background jobs and frontend rendering. |
| `intentParameters.dormancyDays` | Integer 1–730 if set. | Prevents absurdly long dormancy windows that return near-zero results. |
| `intentParameters.minOrders` | Integer 1–100 if set. | Prevents filter from being wider than intended. |
| `revenueEstimate.conversionRate` | Number 0–1 if set. | Conversion rates outside this range are nonsensical. |
| `hmacSecret` | Required when `status` is `ACTIVE` or later. 64 hex chars. | Callbacks arriving before the secret is set would fail verification, causing mass status update failure. |
| `totalRecipients` | Integer ≥ 0 when set. | 0 is a valid value (campaign with 0 recipients should be blocked at launch, but may happen if audience changes between DRAFT and launch). |

### Indexes

```
{ status: 1 }                              Campaign list filter (active campaigns, history)
{ status: 1, launchedAt: -1 }             COMPOUND — active campaigns sorted by most recent
{ launchedAt: 1 }                          Conversion detection job: campaigns within 14-day window
{ completedAt: 1 }                         SPARSE — post-campaign report trigger
{ goalType: 1 }                            Analytics by campaign type
{ createdAt: -1 }                          Campaign list ordered by creation time
```

### Sample Document

```json
{
  "_id": "64c9d4e5f6a7b8c9d0e1f2a3",
  "brandId": null,
  "name": "Win Back — Dormant 90d — June 2024",
  "goalText": "Win back customers dormant for 90 days",
  "goalType": "WIN_BACK",
  "status": "COMPLETED",
  "intentType": "WIN_BACK",
  "intentParameters": {
    "dormancyDays": 90,
    "minOrders": 2,
    "maxOrders": null,
    "minSpend": null,
    "productCategory": null,
    "acquisitionChannel": null
  },
  "audienceFilter": {
    "lastOrderAt": { "$lt": "2024-03-01T00:00:00.000Z" },
    "totalOrders": { "$gte": 2 },
    "optOutChannels": { "$nin": ["WHATSAPP"] }
  },
  "audienceSnapshot": {
    "count": 447,
    "medianAOV": 2800,
    "channelMix": { "WHATSAPP": 312, "EMAIL": 135 },
    "savedAt": "2024-06-01T10:15:00.000Z"
  },
  "totalRecipients": 440,
  "scheduledAt": null,
  "launchedAt": "2024-06-01T10:22:00.000Z",
  "completedAt": "2024-06-15T10:22:00.000Z",
  "hmacSecret": "a3f8b2c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1",
  "revenueEstimate": {
    "min": 123200,
    "max": 184800,
    "conversionRate": 0.05,
    "source": "INDUSTRY_BENCHMARK"
  },
  "aiReport": "## Campaign Performance\n\nThe win-back campaign reached 440 dormant customers...",
  "aiReportGeneratedAt": "2024-06-03T10:30:00.000Z",
  "createdAt": "2024-06-01T10:14:00.000Z",
  "draftSavedAt": "2024-06-01T10:15:00.000Z"
}
```

### Primary Query Patterns

```
// 1. Campaign list (active and recent campaigns)
db.campaigns.find({ status: { $in: ["ACTIVE", "COMPLETED"] } })
            .sort({ launchedAt: -1 })
// → uses: { status, launchedAt } compound index

// 2. Campaigns within attribution window (conversion detection job)
db.campaigns.find({
  status: "ACTIVE",
  launchedAt: { $gte: fourteenDaysAgo }
})
// → uses: launchedAt index (status index less selective here)

// 3. Campaigns needing AI report (post-campaign report job)
db.campaigns.find({
  status: "COMPLETED",
  aiReport: null,
  completedAt: { $lt: fortyEightHoursAgo }
})
// → uses: completedAt sparse index

// 4. Campaign stats (frontend polling, every 3s)
db.campaigns.findOne({ _id: ObjectId("...") }, {
  status: 1, totalRecipients: 1, aiReport: 1, revenueEstimate: 1
})
// → single document lookup by _id (always uses _id index)
```

---

## 6. Collection: `campaign_clusters`

### Purpose

Behavioral clusters within a campaign — the AI-generated audience segments that receive different, persona-appropriate messages. One campaign has 2–3 clusters. Each cluster holds its message template, channel assignment, and aggregated delivery statistics. Statistics are incremented by the callback handler as events arrive — this avoids querying `campaign_messages` for every funnel refresh.

### Schema

```javascript
{
  // Identity
  _id:                    ObjectId,    // MongoDB auto-generated PK
  brandId:                ObjectId,    // reserved for multi-tenancy — not active in V1
  campaignId:             ObjectId,    // FK → campaigns._id

  // Cluster definition (from LLM Calls 2 and 3)
  clusterLabel:           String,      // display name: "DORMANT_VIPS" | "SEASONAL_SHOPPERS" | etc.
  clusterDescription:     String,      // 1-2 sentence behavioral description for the marketer
  clusterRationale:       String,      // LLM's explanation: why these customers were grouped together
  rfmPatternDescription:  String,      // e.g., "R=1-2, F=3-5, M=3-5 — low recency, high loyalty"

  // Audience
  memberCount:            Number,      // number of customers assigned to this cluster

  // Channel assignment
  assignedChannel:        String,      // "WHATSAPP" | "EMAIL" | "SMS"
  channelConfidence:      String,      // "HIGH" | "MEDIUM" | "LOW"
  channelConfidenceReason: String,     // e.g., "Based on 3 prior campaigns: 71% open rate on WhatsApp"

  // Message template
  message: {
    subject:              String,      // email subject line (null for WhatsApp/SMS)
    body:                 String,      // message body — plain text, may include {firstName} token
    ctaText:              String,      // CTA button label: "Shop Now", "Claim Offer"
    ctaUrl:               String,      // original destination URL (stored before link rewriting)
    rationale:            String       // LLM's explanation of why this message fits this cluster
  },

  // Aggregated delivery stats — maintained as running counters
  // Incremented atomically by the callback handler via $inc
  // Used by the delivery funnel without querying campaign_messages
  stats: {
    queued:               Number,      // messages written to dispatch_jobs (set at launch)
    sent:                 Number,      // SENT callbacks received
    delivered:            Number,      // DELIVERED callbacks received
    failed:               Number,      // FAILED callbacks received
    opened:               Number,      // OPENED callbacks received
    clicked:              Number,      // CLICKED events recorded (via link tracking)
    converted:            Number       // CONVERTED events (set by conversion detection job)
  },

  createdAt:              Date         // when this cluster document was created
}
```

### Validation Rules

| Field | Rule | Reason |
|---|---|---|
| `campaignId` | Required. Valid ObjectId. | Orphaned clusters cannot be queried by campaign. |
| `clusterLabel` | Required. String. Max 100 chars. | Displayed to marketer in campaign review. |
| `memberCount` | Required. Integer ≥ 0. | 0 is valid — cluster may have 0 members after audience filtering. |
| `assignedChannel` | Required. Enum: `["WHATSAPP","EMAIL","SMS"]`. | Invalid channel breaks dispatch routing. |
| `channelConfidence` | Required. Enum: `["HIGH","MEDIUM","LOW"]`. | Displayed to marketer — they need to understand confidence level. |
| `message.body` | Required. String. Min 10 chars, max 1600 chars. | SMS max is 160 chars (10 segments). WhatsApp allows more. 1600 chars is a safe upper bound. |
| `stats.*` | All stats fields: Integer ≥ 0. Default 0. | Negative counters indicate double-decrement bugs. |

### Indexes

```
{ campaignId: 1 }                          Fetch all clusters for a campaign (campaign review page)
{ campaignId: 1, clusterLabel: 1 }         COMPOUND UNIQUE — one cluster label per campaign
```

### Sample Document

```json
{
  "_id": "64d0e5f6a7b8c9d0e1f2a3b4",
  "brandId": null,
  "campaignId": "64c9d4e5f6a7b8c9d0e1f2a3",
  "clusterLabel": "DORMANT_VIPS",
  "clusterDescription": "High-value customers who purchased frequently but went quiet after the festive season.",
  "clusterRationale": "This group has strong monetary and frequency scores (M=4, F=4) but poor recency (R=1-2). They were once loyal, high-spending customers. The drop in recency is likely seasonal, not brand-driven.",
  "rfmPatternDescription": "R=1-2, F=4-5, M=4-5",
  "memberCount": 183,
  "assignedChannel": "WHATSAPP",
  "channelConfidence": "HIGH",
  "channelConfidenceReason": "Based on 2 prior campaigns: WhatsApp averaged 68% open rate for this segment vs 21% for email.",
  "message": {
    "subject": null,
    "body": "Hi {firstName}, it's been a while! We've been busy curating new arrivals just for our favourite customers. Come see what's new at Raga — your style is waiting.",
    "ctaText": "Explore New Arrivals",
    "ctaUrl": "https://raga.in/new-collection",
    "rationale": "Exclusivity-first message. This segment has high brand affinity but low discount sensitivity. Leading with new product rather than a discount aligns with their purchase history."
  },
  "stats": {
    "queued": 183,
    "sent": 181,
    "delivered": 174,
    "failed": 2,
    "opened": 119,
    "clicked": 47,
    "converted": 22
  },
  "createdAt": "2024-06-01T10:20:00.000Z"
}
```

### Primary Query Patterns

```
// 1. Get all clusters for a campaign (campaign review and detail pages)
db.campaign_clusters.find({ campaignId: ObjectId("...") })
// → uses: campaignId index

// 2. Increment stats counter on callback (atomic)
db.campaign_clusters.updateOne(
  { _id: ObjectId("...") },
  { $inc: { "stats.delivered": 1 } }
)
// → single document update by _id — always fast

// 3. Campaign funnel from cluster stats (no aggregation needed)
db.campaign_clusters.find(
  { campaignId: ObjectId("...") },
  { stats: 1, clusterLabel: 1, memberCount: 1 }
)
// → returns pre-aggregated stats, frontend sums them
```

---

## 7. Collection: `campaign_messages`

### Purpose

One document per customer per campaign — the current delivery state of each individual message. This is the stateful record of what happened to each message. It is updated as callbacks arrive. It is also the link between a customer and their campaign history, and the basis for conversion attribution.

This collection is separate from `communication_events` (§8), which is the immutable event log. `campaign_messages` answers "what is the current status?" `communication_events` answers "what happened, and when?"

### Schema

```javascript
{
  // Identity
  _id:                ObjectId,    // MongoDB auto-generated PK — used as the messageId
                                   // in dispatch_jobs and communication_events
  brandId:            ObjectId,    // reserved for multi-tenancy — not active in V1

  // Relationships
  campaignId:         ObjectId,    // FK → campaigns._id
  clusterId:          ObjectId,    // FK → campaign_clusters._id — which cluster this customer belongs to
  customerId:         ObjectId,    // FK → customers._id

  // Delivery details
  channel:            String,      // "WHATSAPP" | "EMAIL" | "SMS" — channel used for this customer
  recipient:          String,      // phone (+919876543210) or email — the actual delivery address
                                   // copied from customer.phone or customer.email at dispatch time

  // Click tracking
  clickTrackingPath:  String,      // the CRM-owned redirect path: "/track/click/{_id}"
  ctaUrl:             String,      // denormalized from campaign_clusters.message.ctaUrl
                                   // stored here for single-query redirect (no join needed)

  // Current delivery status (last-write-wins, updated on each callback)
  status:             String,      // "QUEUED" | "SENT" | "DELIVERED" | "FAILED" |
                                   // "OPENED" | "CLICKED" | "CONVERTED"

  // Status timestamps — null until that status is reached
  // Set on first occurrence — not overwritten on repeat events (idempotent update)
  queuedAt:           Date,        // when the dispatch_job was written
  sentAt:             Date,        // first SENT callback received
  deliveredAt:        Date,        // first DELIVERED callback received
  openedAt:           Date,        // first OPENED callback received
  clickedAt:          Date,        // first CLICKED event recorded
  convertedAt:        Date,        // first CONVERTED event (set by conversion job)
  failedAt:           Date,        // when FAILED status was set

  failureReason:      String,      // error message from provider (null unless FAILED)
  createdAt:          Date
}
```

### Validation Rules

| Field | Rule | Reason |
|---|---|---|
| `campaignId` | Required. Valid ObjectId. | Orphaned messages cannot be counted in campaign funnel. |
| `clusterId` | Required. Valid ObjectId. | Cluster stats increments require a valid cluster reference. |
| `customerId` | Required. Valid ObjectId. | Conversion detection requires customerId to match orders. |
| `channel` | Required. Enum: `["WHATSAPP","EMAIL","SMS"]`. | Invalid channel breaks Channel Service routing. |
| `recipient` | Required. E.164 phone or RFC 5322 email depending on channel. | Invalid recipient causes silent delivery failure. |
| `status` | Required. Enum of valid statuses. | Invalid status corrupts funnel counts. |
| `ctaUrl` | Required if `channel != "SMS"` (SMS has no link). | Click tracking redirect fails without this. |

### Indexes

```
{ campaignId: 1 }                           Funnel query: all messages for a campaign
{ campaignId: 1, status: 1 }               COMPOUND — funnel breakdown by status
                                            Most important analytics query
{ customerId: 1 }                           Customer message history
{ customerId: 1, campaignId: 1 }           COMPOUND UNIQUE — one message per customer
                                            per campaign (enforces deduplication at launch)
{ campaignId: 1, clusterId: 1, status: 1 } COMPOUND — per-cluster funnel breakdown
{ status: 1, convertedAt: 1 }              SPARSE — conversion detection job: find
                                            converted messages in attribution window
```

**Critical index note:** The compound unique index on `{ customerId, campaignId }` prevents the same customer from receiving two messages in one campaign — a consequence of a fan-out bug. This is enforced at the database level, not the application level, which is the correct placement.

### Sample Document

```json
{
  "_id": "64e1f6a7b8c9d0e1f2a3b4c5",
  "brandId": null,
  "campaignId": "64c9d4e5f6a7b8c9d0e1f2a3",
  "clusterId": "64d0e5f6a7b8c9d0e1f2a3b4",
  "customerId": "64a7b2c3d4e5f6a7b8c9d0e1",
  "channel": "WHATSAPP",
  "recipient": "+919876543210",
  "clickTrackingPath": "/track/click/64e1f6a7b8c9d0e1f2a3b4c5",
  "ctaUrl": "https://raga.in/new-collection",
  "status": "CONVERTED",
  "queuedAt":    "2024-06-01T10:22:00.000Z",
  "sentAt":      "2024-06-01T10:22:03.000Z",
  "deliveredAt": "2024-06-01T10:22:18.000Z",
  "openedAt":    "2024-06-01T10:35:44.000Z",
  "clickedAt":   "2024-06-01T10:36:02.000Z",
  "convertedAt": "2024-06-03T14:22:00.000Z",
  "failedAt":    null,
  "failureReason": null,
  "createdAt":   "2024-06-01T10:22:00.000Z"
}
```

### Primary Query Patterns

```
// 1. Campaign delivery funnel (aggregation — used when cluster stats are unavailable)
db.campaign_messages.aggregate([
  { $match: { campaignId: ObjectId("...") } },
  { $group: { _id: "$status", count: { $sum: 1 } } }
])
// → uses: { campaignId, status } compound index

// 2. Per-cluster breakdown for post-campaign AI report
db.campaign_messages.aggregate([
  { $match: { campaignId: ObjectId("...") } },
  { $group: {
    _id: { clusterId: "$clusterId", status: "$status" },
    count: { $sum: 1 }
  }}
])
// → uses: { campaignId, clusterId, status } compound index

// 3. Update status on callback (idempotent)
db.campaign_messages.updateOne(
  { _id: ObjectId("..."), deliveredAt: null },   // only update if not already delivered
  { $set: { status: "DELIVERED", deliveredAt: new Date() } }
)
// → single document update by _id

// 4. Click tracking redirect (GET /track/click/{messageId})
db.campaign_messages.findOne(
  { _id: ObjectId("...") },
  { ctaUrl: 1, customerId: 1, clusterId: 1, campaignId: 1 }
)
// → single document lookup by _id — always O(1)
```

---

## 8. Collection: `communication_events`

### Purpose

An immutable, append-only event log of every status transition for every message. One document per event, not per message. While `campaign_messages` holds the *current* state, `communication_events` holds the *complete history*.

**Why a separate collection?**

1. **Idempotency:** When the Channel Service retries a callback (network failure on first attempt), the callback arrives twice. The event log uses a unique `idempotencyKey` per `{messageId, eventType}` to reject duplicates at the database level. Without this, a retry delivers two `DELIVERED` events, corrupting the cluster `stats` counters.

2. **Audit trail:** If a marketer disputes a delivery report ("you said 400 messages were delivered, but only 200 customers received it"), the event log provides a queryable record of exactly which events arrived, when, and from which provider.

3. **Delivery time analytics:** Measuring time from `SENT` to `DELIVERED` requires two events. `campaign_messages` only stores the final state — you cannot compute time-to-deliver from it without the event log.

4. **Channel Service callback replay:** If the CRM needs to reprocess callbacks (e.g., after a bug in the callback handler), the event log provides the source of truth to replay from.

### Schema

```javascript
{
  // Identity
  _id:               ObjectId,    // MongoDB auto-generated PK
  brandId:           ObjectId,    // reserved for multi-tenancy — not active in V1

  // Links
  messageId:         ObjectId,    // FK → campaign_messages._id
  campaignId:        ObjectId,    // denormalized from campaign_messages — for efficient campaign queries
  customerId:        ObjectId,    // denormalized from campaign_messages — for customer history queries
  clusterId:         ObjectId,    // denormalized from campaign_messages — for cluster analytics

  // Event data
  channel:           String,      // "WHATSAPP" | "EMAIL" | "SMS" — denormalized for channel analytics
  eventType:         String,      // "SENT" | "DELIVERED" | "FAILED" | "OPENED" |
                                  // "CLICKED" | "CONVERTED" | "OPT_OUT"

  // Timing
  eventTimestamp:    Date,        // the time the event actually occurred
                                  // from the Channel Service payload — NOT the time received
  receivedAt:        Date,        // the time the CRM callback handler received this event
                                  // difference = callback delivery lag (useful for debugging)

  // Provider context
  providerMessageId: String,      // optional: message ID from the external provider (SendGrid, etc.)
  metadata:          Object,      // channel-specific context (error codes, bounce type, etc.)

  // Idempotency
  idempotencyKey:    String       // SHA256("{messageId}:{eventType}") — UNIQUE INDEX
                                  // First event wins. Duplicate callbacks are silently rejected.
                                  // Exception: OPT_OUT and FAILED are always written (no dedup)
}
```

**Idempotency key exceptions:** `OPT_OUT` and `FAILED` events are written without idempotency checks — a second failure event with a new error code is meaningful information. All other event types (SENT, DELIVERED, OPENED, CLICKED, CONVERTED) are idempotent — only the first occurrence is stored.

### Validation Rules

| Field | Rule | Reason |
|---|---|---|
| `messageId` | Required. Valid ObjectId. | Without this, events cannot be linked to messages for state updates. |
| `campaignId` | Required. Valid ObjectId. | Campaign-level event aggregation requires this. |
| `eventType` | Required. Enum: `["SENT","DELIVERED","FAILED","OPENED","CLICKED","CONVERTED","OPT_OUT"]`. | Invalid event type corrupts funnel counts. |
| `eventTimestamp` | Required. Valid Date. Must not be in the future. | Future timestamps break chronological event ordering. |
| `idempotencyKey` | Required. String. Validated as hex string. | Unique index enforces deduplication. |

### Indexes

```
{ messageId: 1 }                           Get all events for a message (audit trail)
{ idempotencyKey: 1 }                      UNIQUE — idempotent callback processing
                                           Most important index on this collection
{ campaignId: 1, eventType: 1 }           COMPOUND — event count by type for a campaign
                                           Used for delivery analytics
{ customerId: 1, eventType: 1 }           COMPOUND — customer engagement history
                                           e.g., "has Priya clicked any campaign in last 30 days?"
{ campaignId: 1, eventTimestamp: 1 }      COMPOUND — time-series events for a campaign
                                           Used for delivery time analytics
{ eventTimestamp: 1 }                      TTL candidate — for future event archiving
```

### Sample Documents

```json
// SENT event
{
  "_id": "64f2a7b8c9d0e1f2a3b4c5d6",
  "brandId": null,
  "messageId":  "64e1f6a7b8c9d0e1f2a3b4c5",
  "campaignId": "64c9d4e5f6a7b8c9d0e1f2a3",
  "customerId": "64a7b2c3d4e5f6a7b8c9d0e1",
  "clusterId":  "64d0e5f6a7b8c9d0e1f2a3b4",
  "channel": "WHATSAPP",
  "eventType": "SENT",
  "eventTimestamp": "2024-06-01T10:22:03.000Z",
  "receivedAt":     "2024-06-01T10:22:03.841Z",
  "providerMessageId": "waid.mock-8x7k2p",
  "metadata": {},
  "idempotencyKey": "a3f8b2c1d4e5...sha256_of_messageId_SENT"
}

// DELIVERED event (15 seconds later)
{
  "_id": "64f3b8c9d0e1f2a3b4c5d6e7",
  "brandId": null,
  "messageId":  "64e1f6a7b8c9d0e1f2a3b4c5",
  "campaignId": "64c9d4e5f6a7b8c9d0e1f2a3",
  "customerId": "64a7b2c3d4e5f6a7b8c9d0e1",
  "clusterId":  "64d0e5f6a7b8c9d0e1f2a3b4",
  "channel": "WHATSAPP",
  "eventType": "DELIVERED",
  "eventTimestamp": "2024-06-01T10:22:18.000Z",
  "receivedAt":     "2024-06-01T10:22:18.220Z",
  "providerMessageId": "waid.mock-8x7k2p",
  "metadata": {},
  "idempotencyKey": "b4c9d3e2...sha256_of_messageId_DELIVERED"
}
```

### Primary Query Patterns

```
// 1. Check for duplicate callback before processing (idempotency)
db.communication_events.findOne({ idempotencyKey: "sha256hash..." })
// → uses: unique idempotencyKey index

// 2. Full event history for a message (audit / debugging)
db.communication_events.find({ messageId: ObjectId("...") })
                        .sort({ eventTimestamp: 1 })
// → uses: messageId index

// 3. Campaign delivery event counts (analytics)
db.communication_events.aggregate([
  { $match: { campaignId: ObjectId("...") } },
  { $group: { _id: "$eventType", count: { $sum: 1 } } }
])
// → uses: { campaignId, eventType } compound index

// 4. Delivery time analysis (sent → delivered latency)
db.communication_events.aggregate([
  { $match: { campaignId: ObjectId("..."), eventType: { $in: ["SENT","DELIVERED"] } } },
  { $sort: { messageId: 1, eventTimestamp: 1 } },
  { $group: {
    _id: "$messageId",
    sentAt: { $min: { $cond: [{ $eq: ["$eventType","SENT"] }, "$eventTimestamp", null] } },
    deliveredAt: { $min: { $cond: [{ $eq: ["$eventType","DELIVERED"] }, "$eventTimestamp", null] } }
  }},
  { $project: { deliveryLatencyMs: { $subtract: ["$deliveredAt","$sentAt"] } } }
])
// → uses: { campaignId, eventTimestamp } compound index
```

---

## 9. Collection: `dispatch_jobs`

### Purpose

The message queue between the CRM Service and the Channel Service. The CRM Service writes one document per customer per campaign at launch. The Channel Service polls this collection every 2 seconds, claims jobs atomically, dispatches messages, and updates status. All communication between the two services flows through this collection — the Channel Service reads jobs here and fires HTTP callbacks to the CRM.

This is the queue. It is not a permanent record. Completed jobs (`status: "DONE"`) can be archived after 30 days in production.

### Schema

```javascript
{
  // Identity
  _id:                   ObjectId,    // MongoDB auto-generated PK
  brandId:               ObjectId,    // reserved for multi-tenancy — not active in V1

  // Campaign context
  campaignId:            ObjectId,    // FK → campaigns._id — for campaign-level queue status
  messageId:             ObjectId,    // FK → campaign_messages._id — updated on callback
  customerId:            ObjectId,    // FK → customers._id — for audit

  // Dispatch payload
  channel:               String,      // "WHATSAPP" | "EMAIL" | "SMS"
  recipient:             String,      // phone or email — copied from campaign_messages at fan-out
  messagePayload: {
    subject:             String,      // email subject (null for WhatsApp/SMS)
    body:                String,      // message body with click-tracking URL injected
    ctaUrl:              String,      // original CTA URL (for reference, tracking URL is in body)
    clickTrackingPath:   String       // "/track/click/{messageId}" — injected into body before dispatch
  },

  // Callback config
  callbackUrl:           String,      // "https://xeno-crm.onrender.com/api/v1/campaigns/{id}/callbacks"
                                      // the Channel Service POSTs status updates here
  callbackHmacSecret:    String,      // 32-byte hex — copied from campaigns.hmacSecret
                                      // used by Channel Service to sign callbacks

  // Queue mechanics
  status:                String,      // "QUEUED" | "PROCESSING" | "DONE" | "FAILED"
  attempts:              Number,      // default 0 — max 3 before status set to FAILED
  lastAttemptedAt:       Date,        // null until first attempt
  error:                 String,      // error message from last failed attempt (null until failed)

  // Timestamps
  createdAt:             Date         // when the fan-out wrote this job — used for FIFO ordering
}
```

### Validation Rules

| Field | Rule | Reason |
|---|---|---|
| `campaignId` | Required. Valid ObjectId. | Required for campaign-level queue status queries. |
| `messageId` | Required. Valid ObjectId. | Required to update `campaign_messages` on callback. |
| `channel` | Required. Enum: `["WHATSAPP","EMAIL","SMS"]`. | Channel Service routes by this value. |
| `recipient` | Required. E.164 phone or email. | Invalid recipient causes dispatch failure. |
| `messagePayload.body` | Required. String. | Empty body message is not deliverable. |
| `callbackUrl` | Required. Valid HTTPS URL. | Channel Service must have a valid URL to post callbacks to. |
| `callbackHmacSecret` | Required. 64-char hex string. | Without this, the Channel Service cannot sign callbacks, and CRM will reject them. |
| `status` | Required. Enum: `["QUEUED","PROCESSING","DONE","FAILED"]`. | Queue worker logic depends on exact status values. |
| `attempts` | Integer 0–3. Default 0. | More than 3 attempts indicates the job is dead-lettered. |

### Indexes

```
{ status: 1, createdAt: 1 }               COMPOUND — THE MOST CRITICAL INDEX
                                           Channel Service poll query:
                                           findOneAndUpdate({ status: "QUEUED" })
                                           .sort({ createdAt: 1 })
                                           FIFO ordering. This index is hit every 2 seconds.
{ campaignId: 1, status: 1 }              COMPOUND — campaign queue status
                                           (how many jobs still queued for this campaign?)
{ messageId: 1 }                          Lookup dispatch job by message (debugging)
{ createdAt: 1 }                          TTL index candidate — auto-delete DONE jobs after 30 days
```

### Sample Document

```json
{
  "_id": "64f4c9d0e1f2a3b4c5d6e7f8",
  "brandId": null,
  "campaignId": "64c9d4e5f6a7b8c9d0e1f2a3",
  "messageId":  "64e1f6a7b8c9d0e1f2a3b4c5",
  "customerId": "64a7b2c3d4e5f6a7b8c9d0e1",
  "channel": "WHATSAPP",
  "recipient": "+919876543210",
  "messagePayload": {
    "subject": null,
    "body": "Hi Priya, it's been a while! We've been busy curating new arrivals just for our favourite customers. Come see what's new at Raga: https://xeno-crm.onrender.com/track/click/64e1f6a7b8c9d0e1f2a3b4c5",
    "ctaUrl": "https://raga.in/new-collection",
    "clickTrackingPath": "/track/click/64e1f6a7b8c9d0e1f2a3b4c5"
  },
  "callbackUrl": "https://xeno-crm.onrender.com/api/v1/campaigns/64c9d4e5f6a7b8c9d0e1f2a3/callbacks",
  "callbackHmacSecret": "a3f8b2c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1",
  "status": "DONE",
  "attempts": 1,
  "lastAttemptedAt": "2024-06-01T10:22:03.000Z",
  "error": null,
  "createdAt": "2024-06-01T10:22:00.000Z"
}
```

### Primary Query Patterns

```
// 1. Channel Service poll — atomic job claim (runs every 2 seconds)
db.dispatch_jobs.findOneAndUpdate(
  { status: "QUEUED" },
  { $set: { status: "PROCESSING", lastAttemptedAt: new Date() }, $inc: { attempts: 1 } },
  { sort: { createdAt: 1 }, returnDocument: "after" }
)
// → uses: { status, createdAt } compound index — CRITICAL PATH

// 2. Campaign queue status (how many messages still pending?)
db.dispatch_jobs.countDocuments({ campaignId: ObjectId("..."), status: "QUEUED" })
// → uses: { campaignId, status } compound index

// 3. Dead-letter jobs needing investigation
db.dispatch_jobs.find({ status: "FAILED", campaignId: ObjectId("...") })
// → uses: { campaignId, status } compound index

// 4. Mark job done after successful dispatch
db.dispatch_jobs.updateOne(
  { _id: ObjectId("...") },
  { $set: { status: "DONE" } }
)
// → single document update by _id
```

---

## 10. Collection: `ai_logs`

### Purpose

An observability log of every Gemini API call made by the CRM Service. Used for debugging failed campaigns, tracking token usage and cost, detecting prompt regressions, and auditing what was sent to the LLM for any given campaign decision.

### Schema

```javascript
{
  // Identity
  _id:          ObjectId,    // MongoDB auto-generated PK
  brandId:      ObjectId,    // reserved for multi-tenancy — not active in V1

  // Context
  campaignId:   ObjectId,    // FK → campaigns._id — null for calls not tied to a campaign
                             // (e.g., seed data loading, test calls)
  callType:     String,      // which step in the AI pipeline this call belongs to:
                             // "INTENT" | "AUDIENCE_NARRATIVE" | "MESSAGE_GEN" |
                             // "CRITIQUE" | "POST_CAMPAIGN"

  // Call metadata
  model:        String,      // exact model used: "gemini-1.5-flash" | "gemini-1.5-pro"
  promptHash:   String,      // SHA256 of the prompt text (after variable substitution)
                             // NOT the prompt itself — keeps logs small, enables deduplication
  attemptNumber: Number,     // 1 = first attempt, 2 = retry — tracks retry rate

  // Performance
  latencyMs:    Number,      // end-to-end call duration in milliseconds
  inputTokens:  Number,      // tokens consumed for input (from Gemini API response)
  outputTokens: Number,      // tokens consumed for output
  estimatedCostUsd: Number,  // computed from token counts × model pricing at log time

  // Outcome
  success:      Boolean,     // true = valid structured response received
  errorMessage: String,      // null on success; error detail on failure

  createdAt:    Date         // when the log entry was written
}
```

### Validation Rules

| Field | Rule | Reason |
|---|---|---|
| `callType` | Required. Enum of valid call types. | Invalid call type prevents filtering by pipeline step. |
| `model` | Required. String. Max 100 chars. | Used for per-model performance analysis. |
| `latencyMs` | Required. Integer ≥ 0. | Negative latency indicates a logging bug. |
| `inputTokens` | Required. Integer ≥ 0. | Zero may indicate the call was not made but logged anyway. |
| `success` | Required. Boolean. | The primary field for filtering errors. |
| `attemptNumber` | Required. Integer 1–3. | Values outside range indicate a retry logic bug. |

### Indexes

```
{ campaignId: 1 }                          All LLM calls for a campaign (debugging)
{ callType: 1, success: 1 }               COMPOUND — failure rate per call type
{ createdAt: -1 }                          Recent calls (monitoring dashboard)
{ campaignId: 1, callType: 1 }            COMPOUND — "what did Call 3 produce for this campaign?"
```

### Sample Document

```json
{
  "_id": "64f5d0e1f2a3b4c5d6e7f8a9",
  "brandId": null,
  "campaignId": "64c9d4e5f6a7b8c9d0e1f2a3",
  "callType": "MESSAGE_GEN",
  "model": "gemini-1.5-pro",
  "promptHash": "7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069",
  "attemptNumber": 1,
  "latencyMs": 4218,
  "inputTokens": 847,
  "outputTokens": 412,
  "estimatedCostUsd": 0.0038,
  "success": true,
  "errorMessage": null,
  "createdAt": "2024-06-01T10:20:45.000Z"
}
```

### Primary Query Patterns

```
// 1. All AI calls for a campaign (debugging: "why did this campaign get these messages?")
db.ai_logs.find({ campaignId: ObjectId("...") })
           .sort({ createdAt: 1 })
// → uses: campaignId index

// 2. Failure rate by call type (monitoring)
db.ai_logs.aggregate([
  { $group: {
    _id: { callType: "$callType", success: "$success" },
    count: { $sum: 1 }
  }}
])
// → uses: { callType, success } compound index

// 3. Token usage and cost estimate (operational cost tracking)
db.ai_logs.aggregate([
  { $group: {
    _id: "$model",
    totalInputTokens: { $sum: "$inputTokens" },
    totalOutputTokens: { $sum: "$outputTokens" },
    totalCostUsd: { $sum: "$estimatedCostUsd" }
  }}
])
// → full collection scan — run infrequently (cost report)
```

---

## 11. Collection: `channel_stats`

### Purpose

Aggregated historical performance data per channel per campaign type, used by the channel recommendation logic. One document per `{channel, campaignType}` combination. Updated by the conversion detection job when a campaign is marked `COMPLETED`. Provides the basis for non-cold-start channel recommendations and revenue estimates.

### Schema

```javascript
{
  // Identity
  _id:              ObjectId,    // MongoDB auto-generated PK
  brandId:          ObjectId,    // reserved for multi-tenancy — not active in V1

  // Dimensions
  channel:          String,      // "WHATSAPP" | "EMAIL" | "SMS"
  campaignType:     String,      // "WIN_BACK" | "REWARD_LOYAL" | "UPSELL" |
                                 // "CROSS_SELL" | "ANNOUNCEMENT" | "CUSTOM"

  // Cumulative totals — incremented after each campaign of this type completes
  totalSent:        Number,      // sum of all messages sent via this channel for this campaign type
  totalDelivered:   Number,
  totalOpened:      Number,
  totalClicked:     Number,
  totalConverted:   Number,

  // Computed rates — recalculated after each update
  deliveryRate:     Number,      // totalDelivered / totalSent
  openRate:         Number,      // totalOpened / totalDelivered
  clickRate:        Number,      // totalClicked / totalOpened
  conversionRate:   Number,      // totalConverted / totalSent (end-to-end conversion)

  // Metadata
  campaignCount:    Number,      // number of completed campaigns included in these totals
  lastUpdatedAt:    Date         // when these stats were last refreshed
}
```

### Validation Rules

| Field | Rule | Reason |
|---|---|---|
| `channel` | Required. Enum: `["WHATSAPP","EMAIL","SMS"]`. | Compound unique key. |
| `campaignType` | Required. Enum of valid goal types. | Compound unique key. |
| `totalSent` | Integer ≥ 0. Default 0. | Negative totals indicate double-decrement. |
| `openRate`, `clickRate`, `conversionRate`, `deliveryRate` | Number 0.0–1.0. | Rates outside 0–1 are impossible and indicate a calculation bug. |
| `campaignCount` | Integer ≥ 0. | Used to compute confidence: `campaignCount < 3 → LOW confidence`. |

### Indexes

```
{ channel: 1, campaignType: 1 }           COMPOUND UNIQUE — primary lookup key
                                           Channel recommendation reads this index.
                                           One document per combination.
```

### Sample Documents

```json
// WhatsApp, WIN_BACK — strong performance
{
  "_id": "64f6e1f2a3b4c5d6e7f8a9b0",
  "brandId": null,
  "channel": "WHATSAPP",
  "campaignType": "WIN_BACK",
  "totalSent": 1240,
  "totalDelivered": 1187,
  "totalOpened": 821,
  "totalClicked": 293,
  "totalConverted": 74,
  "deliveryRate": 0.957,
  "openRate": 0.692,
  "clickRate": 0.357,
  "conversionRate": 0.060,
  "campaignCount": 3,
  "lastUpdatedAt": "2024-06-15T10:22:00.000Z"
}

// Email, WIN_BACK — weaker performance
{
  "_id": "64f7f2a3b4c5d6e7f8a9b0c1",
  "brandId": null,
  "channel": "EMAIL",
  "campaignType": "WIN_BACK",
  "totalSent": 430,
  "totalDelivered": 419,
  "totalOpened": 89,
  "totalClicked": 21,
  "totalConverted": 9,
  "deliveryRate": 0.974,
  "openRate": 0.212,
  "clickRate": 0.236,
  "conversionRate": 0.021,
  "campaignCount": 2,
  "lastUpdatedAt": "2024-06-15T10:22:00.000Z"
}
```

**Reading these documents:** For WIN_BACK campaigns, WhatsApp has 3× higher open rate (69% vs 21%) and 3× higher conversion (6% vs 2%). The channel recommendation engine will assign `confidence: "HIGH"` for WhatsApp and `confidence: "MEDIUM"` for email for any future WIN_BACK campaign. The marketer sees both the recommendation and the underlying data.

### Primary Query Patterns

```
// 1. Channel recommendation lookup (used during campaign creation)
db.channel_stats.findOne({ channel: "WHATSAPP", campaignType: "WIN_BACK" })
// → uses: { channel, campaignType } compound unique index

// 2. All stats for a campaign type (compare channels for a given goal)
db.channel_stats.find({ campaignType: "WIN_BACK" })
// → uses: compound index (prefix query on campaignType — less efficient, but infrequent)

// 3. Update stats after campaign completion (atomic increment)
db.channel_stats.updateOne(
  { channel: "WHATSAPP", campaignType: "WIN_BACK" },
  {
    $inc: {
      totalSent: 440, totalDelivered: 421,
      totalOpened: 291, totalClicked: 103, totalConverted: 26,
      campaignCount: 1
    },
    $set: {
      openRate: <recomputed>,
      clickRate: <recomputed>,
      conversionRate: <recomputed>,
      deliveryRate: <recomputed>,
      lastUpdatedAt: new Date()
    }
  },
  { upsert: true }   // creates the document if first campaign of this type+channel
)
// → uses: { channel, campaignType } compound unique index
```

---

## 12. Collection: `import_jobs`

### Purpose

Tracks the status and results of every CSV import. Each CSV upload creates one document. The marketer polls this document to see import progress. Errors are stored here for display in the import results screen.

### Schema

```javascript
{
  // Identity
  _id:          ObjectId,    // MongoDB auto-generated PK — used as the jobId in the API response
  brandId:      ObjectId,    // reserved for multi-tenancy — not active in V1

  // Job metadata
  type:         String,      // "CUSTOMERS" | "ORDERS" — what was imported
  filename:     String,      // original filename from the upload (display only)
  status:       String,      // "PROCESSING" | "COMPLETED" | "FAILED"

  // Results (updated as the job runs)
  totalRows:    Number,      // total rows in the CSV (excluding header)
  imported:     Number,      // rows successfully written to the database
  skipped:      Number,      // rows skipped due to deduplication (phone already exists)
  failed:       Number,      // rows rejected due to validation errors

  // Error detail — capped at 50 entries to prevent document bloat
  errors:       [{
    row:        Number,      // 1-indexed row number from the CSV (including header = row 1)
    field:      String,      // which field caused the error (e.g., "phone", "amount")
    value:      String,      // the invalid value (truncated to 100 chars)
    reason:     String       // human-readable error message
  }],

  // Timestamps
  createdAt:    Date,        // when the upload began
  completedAt:  Date         // null until status = COMPLETED or FAILED
}
```

### Validation Rules

| Field | Rule | Reason |
|---|---|---|
| `type` | Required. Enum: `["CUSTOMERS","ORDERS"]`. | Determines which collection to write to. |
| `status` | Required. Enum: `["PROCESSING","COMPLETED","FAILED"]`. | Frontend polls this value. |
| `errors` | Array. Max 50 elements. | Storing unlimited errors would create unboundedly large documents. After 50, subsequent errors are counted in `failed` but not stored individually. |
| `totalRows` | Integer ≥ 0. | 0 = empty CSV (should fail with a user-friendly error before reaching this point). |

### Indexes

```
{ status: 1, createdAt: -1 }              Import history list (most recent first)
{ createdAt: -1 }                          Recent imports, TTL candidate
```

### Sample Document

```json
{
  "_id": "64f8a3b4c5d6e7f8a9b0c1d2",
  "brandId": null,
  "type": "CUSTOMERS",
  "filename": "raga_customers_june2024.csv",
  "status": "COMPLETED",
  "totalRows": 1000,
  "imported": 983,
  "skipped": 11,
  "failed": 6,
  "errors": [
    {
      "row": 47,
      "field": "phone",
      "value": "9876543",
      "reason": "Invalid phone format. Expected E.164 (+91XXXXXXXXXX)."
    },
    {
      "row": 312,
      "field": "email",
      "value": "not-an-email",
      "reason": "Invalid email format."
    }
  ],
  "createdAt":   "2024-06-01T09:00:00.000Z",
  "completedAt": "2024-06-01T09:00:03.421Z"
}
```

### Primary Query Patterns

```
// 1. Poll job status (frontend polls after upload)
db.import_jobs.findOne({ _id: ObjectId("...") }, { status: 1, imported: 1, failed: 1, errors: 1 })
// → single document lookup by _id

// 2. Import history list
db.import_jobs.find({}).sort({ createdAt: -1 }).limit(20)
// → uses: { status, createdAt } compound index
```

---

## 13. Multi-Tenancy Strategy

### Current State (V1)

All documents contain a `brandId: ObjectId` field. In V1, this field is set to `null` for all documents and is not included in any query. The schema is multi-tenancy-ready but not multi-tenancy-active.

### Activation Path

Multi-tenancy can be activated without any schema migration — MongoDB's flexible schema allows adding query predicates to documents that already have the field present.

**Step 1: Update application middleware**  
Add a middleware layer to the CRM Service that reads the authenticated brand's `brandId` from the JWT/API key and attaches it to the request context. Every subsequent database operation includes `{ brandId: requestContext.brandId }` in the query filter.

**Step 2: Update indexes**  
Replace every single-field index with a compound index prefixed by `brandId`:

```
Before:  { phone: 1 }                    (customers)
After:   { brandId: 1, phone: 1 }        UNIQUE scoped to brand

Before:  { lastOrderAt: 1 }
After:   { brandId: 1, lastOrderAt: 1 }

Before:  { status: 1, createdAt: 1 }     (dispatch_jobs)
After:   { brandId: 1, status: 1, createdAt: 1 }
```

**Step 3: Seed isolation**  
The seed data script assigns a known `brandId` (e.g., `DEMO_BRAND_ID`) to all demo documents. New brands get a new `brandId` at signup. Documents from one brand are never visible to another brand.

**Why this approach:**  
No data migration is required. The field exists in every document today. The only changes are: adding `brandId` to query filters, and updating indexes. This is the cleanest multi-tenancy activation path for MongoDB.

### Data Volume Impact

At 100 brands × 50,000 customers each = 5M customer documents. At 100 bytes per document average, this is 500MB — above the Atlas M0 free tier. The M10 tier ($57/month) supports 10GB. Multi-tenancy activation should coincide with a tier upgrade.

---

## 14. Index Summary

All indexes for quick reference during implementation. Create these at application startup using `createIndex` with `{ background: true }`.

### `customers`
| Index | Type | Fields |
|---|---|---|
| phone_unique | Unique | `{ phone: 1 }` |
| lastOrderAt | Standard | `{ lastOrderAt: 1 }` |
| rfmSegment | Standard | `{ rfmSegment: 1 }` |
| audience_query | Compound | `{ lastOrderAt: 1, totalOrders: 1 }` |
| segment_recency | Compound | `{ rfmSegment: 1, lastOrderAt: 1 }` |
| email | Sparse | `{ email: 1 }` |

### `orders`
| Index | Type | Fields |
|---|---|---|
| orderId_unique | Unique | `{ orderId: 1 }` |
| customerId | Standard | `{ customerId: 1 }` |
| orderDate | Standard | `{ orderDate: 1 }` |
| customer_timeline | Compound | `{ customerId: 1, orderDate: -1 }` |
| productCategory | Standard | `{ productCategory: 1 }` |
| attribution | Sparse | `{ campaignAttributedTo: 1 }` |

### `campaigns`
| Index | Type | Fields |
|---|---|---|
| status | Standard | `{ status: 1 }` |
| status_launched | Compound | `{ status: 1, launchedAt: -1 }` |
| launchedAt | Standard | `{ launchedAt: 1 }` |
| completedAt | Sparse | `{ completedAt: 1 }` |
| goalType | Standard | `{ goalType: 1 }` |
| createdAt | Standard | `{ createdAt: -1 }` |

### `campaign_clusters`
| Index | Type | Fields |
|---|---|---|
| campaignId | Standard | `{ campaignId: 1 }` |
| campaign_label_unique | Compound Unique | `{ campaignId: 1, clusterLabel: 1 }` |

### `campaign_messages`
| Index | Type | Fields |
|---|---|---|
| campaignId | Standard | `{ campaignId: 1 }` |
| campaign_status | Compound | `{ campaignId: 1, status: 1 }` |
| customerId | Standard | `{ customerId: 1 }` |
| customer_campaign_unique | Compound Unique | `{ customerId: 1, campaignId: 1 }` |
| cluster_status | Compound | `{ campaignId: 1, clusterId: 1, status: 1 }` |
| conversion | Sparse Compound | `{ status: 1, convertedAt: 1 }` |

### `communication_events`
| Index | Type | Fields |
|---|---|---|
| idempotencyKey_unique | Unique | `{ idempotencyKey: 1 }` |
| messageId | Standard | `{ messageId: 1 }` |
| campaign_event | Compound | `{ campaignId: 1, eventType: 1 }` |
| customer_event | Compound | `{ customerId: 1, eventType: 1 }` |
| campaign_time | Compound | `{ campaignId: 1, eventTimestamp: 1 }` |

### `dispatch_jobs`
| Index | Type | Fields |
|---|---|---|
| queue_poll | Compound | `{ status: 1, createdAt: 1 }` ← **Most critical** |
| campaign_status | Compound | `{ campaignId: 1, status: 1 }` |
| messageId | Standard | `{ messageId: 1 }` |

### `ai_logs`
| Index | Type | Fields |
|---|---|---|
| campaignId | Standard | `{ campaignId: 1 }` |
| calltype_success | Compound | `{ callType: 1, success: 1 }` |
| createdAt | Standard | `{ createdAt: -1 }` |
| campaign_calltype | Compound | `{ campaignId: 1, callType: 1 }` |

### `channel_stats`
| Index | Type | Fields |
|---|---|---|
| channel_type_unique | Compound Unique | `{ channel: 1, campaignType: 1 }` |

### `import_jobs`
| Index | Type | Fields |
|---|---|---|
| status_created | Compound | `{ status: 1, createdAt: -1 }` |
| createdAt | Standard | `{ createdAt: -1 }` |

---

## 15. Storage Estimates

For Atlas M0 free tier (512MB limit). All estimates are for the demo dataset (1,000 customers, 3,000 orders, 5 campaigns with ~450 recipients each).

| Collection | Documents | Avg Doc Size | Total |
|---|---|---|---|
| customers | 1,000 | ~400 bytes | ~0.4 MB |
| orders | 3,000 | ~300 bytes | ~0.9 MB |
| campaigns | 10 | ~2 KB | ~0.02 MB |
| campaign_clusters | 25 | ~800 bytes | ~0.02 MB |
| campaign_messages | 2,250 | ~500 bytes | ~1.1 MB |
| communication_events | 11,250 | ~300 bytes | ~3.4 MB |
| dispatch_jobs | 2,250 | ~600 bytes | ~1.4 MB |
| ai_logs | 50 | ~400 bytes | ~0.02 MB |
| channel_stats | 18 | ~200 bytes | ~0.004 MB |
| import_jobs | 5 | ~1 KB | ~0.005 MB |
| **Total data** | | | **~7.3 MB** |
| Index overhead (~3×) | | | ~22 MB |
| **Total estimated** | | | **~30 MB** |

Well within Atlas M0 (512 MB). Atlas M0 supports this comfortably with significant headroom for growth before a tier upgrade is needed.

**Note on `communication_events` volume:** At 5 campaigns × 450 recipients × 5 events per message (QUEUED, SENT, DELIVERED, OPENED, CLICKED) = 11,250 documents. In a production environment with 100k+ recipients per campaign, this collection grows fastest and should be the first candidate for archiving (TTL index on `eventTimestamp` after 90 days).

---

*Document Status: Version 1.0 — Complete. Next: API_SPEC.md*
