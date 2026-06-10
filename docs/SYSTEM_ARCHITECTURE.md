# Xeno Copilot — System Architecture

**Version:** 1.0  
**Date:** June 2026  
**Status:** Approved for Implementation  
**Builds on:** PRD v1.1

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [System Diagram](#2-system-diagram)
3. [Service Boundaries](#3-service-boundaries)
4. [Data Layer](#4-data-layer)
5. [AI Decision Flow](#5-ai-decision-flow)
6. [Queue Design](#6-queue-design)
7. [Async Callback Flow](#7-async-callback-flow)
8. [Real-Time Updates Strategy](#8-real-time-updates-strategy)
9. [Background Jobs](#9-background-jobs)
10. [Deployment Architecture](#10-deployment-architecture)
11. [Security Boundaries](#11-security-boundaries)
12. [Error Handling Strategy](#12-error-handling-strategy)
13. [Scalability Notes](#13-scalability-notes)
14. [Architectural Decision Records](#14-architectural-decision-records)
15. [Priority: What Is and Is Not Built](#15-priority-what-is-and-is-not-built)

---

## 1. Architecture Overview

Xeno Copilot is composed of three independently deployed services and one shared database.

| Service | Runtime | Deployment | Responsibility |
|---|---|---|---|
| **Frontend** | Next.js 14 (App Router) | Vercel | UI, campaign creation flow, analytics display |
| **CRM Service** | Node.js + Express | Render | All business logic, AI pipeline, campaign management, ingestion, analytics |
| **Channel Service** | Node.js + Express | Render (separate) | Message dispatch, channel adapters, callback dispatch |
| **Database** | MongoDB Atlas (M0) | Atlas Cloud | Shared data store for all three services |

**Why three separate services?**  
The assignment specification requires a separate Channel Service URL and independent deployment. Beyond compliance, the separation provides fault isolation: a hung SendGrid call cannot block the CRM API, and the Channel Service can be scaled independently of business logic.

**Why a shared database instead of a separate data store per service?**  
For a three-day build with one developer, inter-service HTTP communication for simple data reads adds latency, failure surface, and implementation overhead with no meaningful benefit at this scale. Both services connect directly to MongoDB Atlas. The service boundary is enforced at the application layer, not the data layer. This is a pragmatic concession to build time. In a production multi-tenant system, the Channel Service would receive all data it needs in the dispatch payload and would not read from the CRM database at all.

---

## 2. System Diagram

```
┌────────────────────────────────────────────────────────────┐
│                         VERCEL                             │
│                                                            │
│   ┌──────────────────────────────────────────────────┐    │
│   │              Next.js Frontend                    │    │
│   │   TypeScript · Tailwind · ShadCN                 │    │
│   │                                                  │    │
│   │   / (Command Bar)                                │    │
│   │   /campaigns/[id] (Live Funnel)                  │    │
│   │   /analytics (Audience Health)                   │    │
│   └──────────────────────┬───────────────────────────┘    │
└─────────────────────────┬┼────────────────────────────────┘
                          ││  HTTPS REST  (CORS allowed)
                          ▼│
┌─────────────────────────┴──────────────────────────────────┐
│                   RENDER — CRM Service                     │
│                                                            │
│   Express · Node.js                                        │
│                                                            │
│   ┌──────────────┐  ┌───────────────┐  ┌───────────────┐  │
│   │  Ingestion   │  │  AI Pipeline  │  │  Campaign     │  │
│   │  /customers  │  │  (Gemini API) │  │  Management   │  │
│   │  /orders     │  │  5 LLM calls  │  │  /campaigns   │  │
│   └──────────────┘  └───────────────┘  └───────────────┘  │
│                                                            │
│   ┌──────────────┐  ┌───────────────┐  ┌───────────────┐  │
│   │  Segments    │  │  Analytics    │  │  Callback     │  │
│   │  /segments   │  │  Aggregation  │  │  Receiver     │  │
│   └──────────────┘  └───────────────┘  └───────────────┘  │
│                                                            │
│   ┌──────────────────────────────────────────────────┐    │
│   │              Background Jobs                     │    │
│   │   RFM Compute · Conversion Detector              │    │
│   └──────────────────────────────────────────────────┘    │
└──────────────────────────┬─────────────────────────────────┘
                           │ Read / Write
                           │
┌──────────────────────────▼─────────────────────────────────┐
│                    MongoDB Atlas (M0)                      │
│                                                            │
│  customers · orders · campaigns · campaign_clusters        │
│  campaign_messages · dispatch_jobs · ai_logs               │
│  channel_stats · import_jobs                               │
└──────────────────────────┬─────────────────────────────────┘
                           │ Poll dispatch_jobs
                           │ every 2 seconds
┌──────────────────────────▼─────────────────────────────────┐
│                RENDER — Channel Service                    │
│                                                            │
│   Express · Node.js                                        │
│                                                            │
│   ┌──────────────┐  ┌───────────────┐  ┌───────────────┐  │
│   │ Queue Worker │  │  Adapters     │  │  Callback     │  │
│   │ (poll loop)  │  │  Email (real) │  │  Dispatcher   │  │
│   │              │  │  WA (mock)    │  │  HMAC signed  │  │
│   │              │  │  SMS (mock)   │  │               │  │
│   └──────────────┘  └───────────────┘  └───────────────┘  │
└──────────────────────────┬─────────────────────────────────┘
                           │  POST /api/v1/campaigns/{id}/callbacks
                           │  (HMAC signed, back to CRM Service)
                           ▼
                    [CRM Service — Callback Receiver]

External:
  SendGrid API  ←── Email adapter
  Gemini API    ←── AI Pipeline
```

---

## 3. Service Boundaries

### 3.1 CRM Service

**Responsibilities:**
- All customer and order data ingestion (CSV + REST API)
- RFM computation and segmentation
- The complete AI campaign creation workflow (5 LLM calls via Gemini)
- Campaign record management
- Writing dispatch jobs to MongoDB for the Channel Service
- Receiving and validating callback POSTs from the Channel Service
- Updating campaign message statuses from callbacks
- Conversion detection background job
- Analytics aggregation
- Serving all API endpoints consumed by the frontend

**Does NOT:**
- Send messages directly
- Make outbound calls to WhatsApp, SMS providers
- Store channel provider credentials (those live in the Channel Service)

**Base URL:** `https://xeno-crm.onrender.com`

### 3.2 Channel Service

**Responsibilities:**
- Poll the `dispatch_jobs` collection every 2 seconds
- Claim and process queued dispatch jobs
- Route each job to the correct channel adapter
- Fire HMAC-signed callback POSTs to the CRM Service as status changes occur
- Simulate realistic delivery delays for mock providers

**Does NOT:**
- Understand campaigns, customers, or segments
- Make any business logic decisions
- Write to any collection except updating `dispatch_jobs` status

**Design principle:** The Channel Service is stateless except for the `dispatch_jobs` collection. It knows nothing about the campaign. It receives a payload, sends a message, and fires callbacks. Replacing the WhatsApp mock with a real provider requires changing exactly one adapter file.

**Base URL:** `https://xeno-channel.onrender.com`

### 3.3 Frontend

**Responsibilities:**
- All user-facing screens
- Campaign creation flow (command bar → AI pipeline steps → review → launch)
- Live delivery funnel (polling campaign stats every 3 seconds)
- Analytics display
- CSV upload UI
- Settings (brand voice, seed data)

**Does NOT:**
- Call Gemini directly
- Write to MongoDB
- Execute business logic

**Communication:** Direct HTTPS calls to the CRM Service REST API. No Next.js API routes used as a proxy — the frontend calls the CRM backend directly. This eliminates a redundant network hop and simplifies debugging.

**Base URL:** `https://xeno-copilot.vercel.app`

### 3.4 PRD Challenge: SQL → Parameterized Intent Extraction

The PRD specified that LLM Call 1 generates "SQL predicate" output. The tech stack mandates MongoDB. This is corrected here — and corrected further from the original architecture draft, which proposed having the LLM generate raw MongoDB filter objects.

**LLM generates intent and parameters only. The CRM Service generates all MongoDB queries.**

The LLM's role in Call 1 is to parse human language into a structured intent object with named scalar parameters. It never touches MongoDB operators, field names, or query syntax. The CRM Service owns a whitelist of allowed query patterns and maps the intent parameters to safe, pre-defined MongoDB queries.

**LLM Call 1 output schema:**
```json
{
  "intent_type": "WIN_BACK",
  "parameters": {
    "dormancyDays": 90,
    "minOrders": 2,
    "maxOrders": null,
    "minSpend": null,
    "productCategory": null,
    "acquisitionChannel": null
  },
  "confirmation_text": "I'll target customers who haven't purchased in 90+ days and have made at least 2 prior purchases. Does this sound right?"
}
```

**CRM Service whitelist mapping (application code, not LLM):**
```
intent: WIN_BACK
  → lastOrderAt: { $lt: now - dormancyDays }
  → totalOrders: { $gte: minOrders }        (if minOrders set)
  → totalOrders: { $lte: maxOrders }        (if maxOrders set)
  → productCategory: value                   (if set)
  → optOutChannels: { $nin: [channel] }      (always enforced)

intent: REWARD_LOYAL
  → totalSpend: { $gte: topSpendPercentile } (computed from dataset)
  → lastOrderAt: { $gte: now - 30 days }

intent: UPSELL / CROSS_SELL
  → productCategory: { $in: [relatedCategories] }
  → lastOrderAt: { $gte: now - 90 days }

intent: ANNOUNCEMENT
  → lastOrderAt: { $gte: now - 180 days }   (engaged customers only)

intent: CUSTOM
  → surfaced to marketer as manual segment builder
```

**Why this matters:** The LLM never constructs a MongoDB query. It cannot accidentally generate `{}` (match all), use `$where` for JavaScript injection, or produce operators that cause a full collection scan on Atlas M0. Every operator, every field name, every boundary condition is owned by application code that is reviewed, tested, and version-controlled. The LLM extracts meaning from language. The application owns data access.

**Parameter validation:** Before executing any query, the CRM Service validates that all parameters are within acceptable ranges (e.g., `dormancyDays` between 1 and 730, `minOrders` between 1 and 100). Parameters outside range are clamped and the confirmation text is updated to reflect the adjusted values.

---

## 4. Data Layer

### 4.1 MongoDB Atlas — Choice and Constraints

**Why MongoDB over PostgreSQL:**  
The tech stack mandates MongoDB. MongoDB is a valid and natural fit for this product: customer documents with embedded computed fields, flexible order schemas that vary by retail vertical, and campaign documents with nested cluster and message structures map cleanly to documents. The aggregation pipeline is powerful enough for all analytics requirements.

**Atlas M0 (Free Tier) Constraints:**
- 512 MB storage limit — sufficient for demo (1,000 customers + 3,000 orders ≈ ~5 MB)
- Shared CPU — aggregation queries should be lean
- No dedicated RAM — keep indexes lean and targeted
- No VPC peering — both Render services connect over the public internet (TLS required, always)

### 4.2 Collections

#### `customers`
```
{
  _id: ObjectId,
  brandId: ObjectId,       // reserved for multi-tenancy — not active in V1
  phone: String,           // E.164, unique index
  name: String,
  email: String,           // sparse index
  source: "csv" | "api",
  tags: [String],
  optOutChannels: [String], // ["whatsapp", "email", "sms"]
  createdAt: Date,
  updatedAt: Date,

  // Computed by RFM job — full recompute after every ingestion
  lastOrderAt: Date,       // index
  totalOrders: Number,
  totalSpend: Number,
  rfmR: Number,            // 1–5
  rfmF: Number,            // 1–5
  rfmM: Number,            // 1–5
  rfmSegment: String       // "Champions" | "Dormant VIPs" | etc.
}
```
**Indexes:** `phone` (unique), `lastOrderAt`, `rfmSegment`, `{ lastOrderAt, totalOrders }` (compound, used by audience queries)

#### `orders`
```
{
  _id: ObjectId,
  brandId: ObjectId,       // reserved for multi-tenancy — not active in V1
  orderId: String,         // unique, from source system
  customerId: ObjectId,    // ref customers
  customerPhone: String,   // denormalized for ingestion joins
  amount: Number,
  productCategory: String,
  orderDate: Date,         // index
  channel: "online" | "offline",
  discountApplied: Boolean,
  campaignAttributedTo: ObjectId, // set by conversion job, null until attributed
  createdAt: Date
}
```
**Indexes:** `customerId`, `orderDate`, `{ customerPhone, orderDate }` (compound)

#### `campaigns`
```
{
  _id: ObjectId,
  brandId: ObjectId,       // reserved for multi-tenancy — not active in V1
  name: String,
  goalText: String,
  goalType: String,        // WIN_BACK | REWARD_LOYAL | UPSELL | CROSS_SELL | ANNOUNCEMENT | CUSTOM

  // Campaign lifecycle (see §4.4 for state machine)
  status: String,          // DRAFT | READY_FOR_REVIEW | LAUNCHING | ACTIVE | COMPLETED | FAILED

  // Audience snapshot — written when campaign is first saved as DRAFT (after Gate 2)
  intentType: String,
  intentParameters: Object, // {dormancyDays, minOrders, ...} — the resolved intent params
  audienceFilter: Object,   // the safe whitelist-generated MongoDB filter (not LLM output)
  audienceSnapshot: {
    count: Number,
    medianAOV: Number,
    channelMix: Object,     // {whatsapp: N, email: N}
    savedAt: Date
  },

  totalRecipients: Number,
  scheduledAt: Date,
  launchedAt: Date,
  completedAt: Date,
  hmacSecret: String,      // generated at launch, used for callback verification
  revenueEstimate: {
    min: Number,
    max: Number,
    source: String         // "Industry benchmark: Klaviyo 2024" or "Based on N prior campaigns"
  },
  aiReport: String,        // populated at T+48h by LLM Call 5
  aiReportGeneratedAt: Date,
  createdAt: Date,
  draftSavedAt: Date       // timestamp when DRAFT was first persisted after Gate 2
}
```
**Indexes:** `status`, `launchedAt`, `completedAt`

#### 4.4 Campaign Status State Machine

```
Goal submitted
      │
      ▼
   [DRAFT] ◄─── Persisted to DB after Human Gate 2 (audience confirmed).
      │          Browser refresh safe from this point forward.
      │
      │  (AI completes Calls 2, 3, 4 — messages + critique ready)
      ▼
[READY_FOR_REVIEW] ◄─── Marketer can read, edit, and approve the full campaign.
      │                  The campaign record holds all AI outputs.
      │
      │  (Marketer clicks Launch)
      ▼
  [LAUNCHING] ◄─── Transient. Fan-out write: dispatch_jobs created for all recipients.
      │              Transitions to ACTIVE once insertMany completes.
      │
      ▼
   [ACTIVE] ◄─── Messages being dispatched. Callbacks arriving. Funnel updating.
      │
      │  (14-day attribution window closes OR all messages reach terminal status)
      ▼
 [COMPLETED] ◄─── Conversion job runs. channel_stats updated. AI report triggered.
      │
      └─── [FAILED] ◄─── Fan-out write failed OR campaign manually aborted.
```

**DRAFT persistence is the critical safety net.** If the marketer refreshes the browser between Gate 2 and launch, the campaign URL (`/campaigns/create/{campaignId}`) reloads the DRAFT state from MongoDB, restoring the audience snapshot, cluster definitions, and generated messages. No LLM calls are re-run.

#### `campaign_clusters`
```
{
  _id: ObjectId,
  brandId: ObjectId,       // reserved for multi-tenancy — not active in V1
  campaignId: ObjectId,    // index
  clusterLabel: String,    // "Dormant VIPs"
  clusterDescription: String,
  clusterRationale: String, // why LLM grouped them this way
  memberCount: Number,
  assignedChannel: String,
  channelConfidence: String, // "high" | "medium" | "low"
  channelConfidenceReason: String,
  message: {
    subject: String,
    body: String,
    ctaText: String,
    ctaUrl: String,
    rationale: String      // LLM's explanation of why this message fits this cluster
  },
  // Aggregated counters — incremented by callback handler
  stats: {
    sent: Number, delivered: Number, failed: Number,
    opened: Number, clicked: Number, converted: Number
  }
}
```

#### `campaign_messages`
```
{
  _id: ObjectId,
  brandId: ObjectId,       // reserved for multi-tenancy — not active in V1
  campaignId: ObjectId,    // index
  clusterId: ObjectId,
  customerId: ObjectId,
  channel: String,
  recipient: String,       // phone or email
  status: String,          // queued | sent | delivered | failed | opened | clicked | converted
  clickTrackingPath: String, // /track/click/{messageId} — set at dispatch time
  ctaUrl: String,          // original CTA URL — denormalized from campaign_clusters for single-lookup redirect
  sentAt: Date, deliveredAt: Date, openedAt: Date,
  clickedAt: Date, convertedAt: Date, failedAt: Date,
  failureReason: String
}
```
**Indexes:** `campaignId`, `customerId`, `status`, `{ campaignId, status }` (compound, used heavily by funnel queries)

#### `dispatch_jobs`
```
{
  _id: ObjectId,
  brandId: ObjectId,       // reserved for multi-tenancy — not active in V1
  campaignId: ObjectId,
  messageId: ObjectId,     // ref campaign_messages
  customerId: ObjectId,
  channel: String,
  recipient: String,
  messagePayload: Object,  // {subject, body, ctaUrl, clickTrackingPath}
  callbackUrl: String,
  callbackHmacSecret: String,
  status: String,          // queued | processing | done | failed
  attempts: Number,        // default 0, max 3
  lastAttemptedAt: Date,
  error: String,
  createdAt: Date          // index (used for ordering pickup)
}
```
**Indexes:** `{ status: 1, createdAt: 1 }` (compound — the Channel Service worker query), `campaignId`

#### `ai_logs`
```
{
  _id: ObjectId,
  brandId: ObjectId,       // reserved for multi-tenancy — not active in V1
  campaignId: ObjectId,    // nullable (seed data calls have no campaign)
  callType: String,        // "intent" | "audience_narrative" | "message_gen" | "critique" | "post_campaign"
  model: String,
  promptHash: String,      // SHA256 of the prompt text — for deduplication and debugging
  latencyMs: Number,
  inputTokens: Number,
  outputTokens: Number,
  success: Boolean,
  errorMessage: String,
  createdAt: Date
}
```

#### `channel_stats`
```
{
  _id: ObjectId,
  brandId: ObjectId,       // reserved for multi-tenancy — not active in V1
  channel: String,         // "whatsapp" | "email" | "sms"
  campaignType: String,    // "WIN_BACK" | "REWARD_LOYAL" | etc.
  totalSent: Number,
  totalDelivered: Number,
  totalOpened: Number,
  totalClicked: Number,
  totalConverted: Number,
  // Computed rates (updated after each campaign completes)
  openRate: Number,
  clickRate: Number,
  conversionRate: Number,
  campaignCount: Number,
  lastUpdatedAt: Date
}
```
**Indexes:** Compound unique on `{ channel, campaignType }` — one document per channel-type combination (e.g., whatsapp + WIN_BACK). This is what enables "WhatsApp outperforms email for win-back but not for announcements."

Used by the channel recommendation logic. Updated by the conversion detection job when a campaign is marked `COMPLETED`.

#### `import_jobs`
```
{
  _id: ObjectId,
  brandId: ObjectId,       // reserved for multi-tenancy — not active in V1
  type: "customers" | "orders",
  filename: String,
  status: "processing" | "completed" | "failed",
  totalRows: Number,
  imported: Number,
  skipped: Number,
  failed: Number,
  errors: [{ row: Number, reason: String }], // max 50 errors stored
  createdAt: Date,
  completedAt: Date
}
```

### 4.3 RFM Computation on MongoDB

The PRD was written with SQL window functions (PostgreSQL `PERCENT_RANK()`) in mind. MongoDB does not have these natively. The RFM computation runs as an application-layer job after **every** ingestion event.

**Rule: Full recompute on every ingestion. No partial updates.**

Rationale: quintile scoring is a global ranking — adding 100 new high-value customers shifts the M quintile boundaries for the entire existing dataset. Updating only the newly imported customers produces stale, incorrect scores for everyone else. Full recompute is the only correct approach. At demo scale (1,000–10,000 customers), the cost is negligible.

```
Trigger: after any customer or order ingestion batch completes

Steps:
1. Aggregate orders collection:
   $group by customerId
   → lastOrderAt: max(orderDate)
   → totalOrders: count(distinct orderId)
   → totalSpend: sum(amount)

2. Load all customer IDs + their aggregated order stats into memory

3. Sort the full customer list three times:
   - by lastOrderAt descending  → assign rfmR (1=oldest, 5=most recent)
   - by totalOrders descending  → assign rfmF
   - by totalSpend descending   → assign rfmM
   Using quintile: top 20% = 5, next 20% = 4, etc.
   Customers with zero orders: rfmR=1, rfmF=1, rfmM=1

4. Apply cluster lookup table to assign rfmSegment per customer

5. Bulk-update all customer documents (MongoDB bulkWrite, unordered)
```

**Performance at scale:**
- 1,000 customers: < 200ms. Synchronous-looking from the API caller's perspective.
- 10,000 customers: ~1–2s. Acceptable as a background task.
- 100,000 customers: 10–30s. Confirmed background-only; API returns immediately, job runs async.

The job is never called synchronously in a request/response cycle. It is always fired as a background callback after the ingestion write completes. The ingestion API returns immediately with `{job_id, status: "ingestion_complete, rfm_recompute_queued"}`.

**V1 production debt note:** At 1M+ customers, loading all customer order stats into memory is unacceptable. Production solution: compute quintile boundaries from a sampled subset (10,000 random customers), materialize the boundaries, then apply them in a streaming update. This is a P2 optimization; the full-recompute approach is correct for V1.

---

## 5. AI Decision Flow

### 5.1 The Five-Call Pipeline

The pipeline runs within the CRM Service. Each call is a dedicated function in `src/services/ai/`. All prompts live in `src/prompts/` as versioned `.txt` files included at build time.

```
User types goal
      │
      ▼
┌─────────────────────────────────────────────────────┐
│  CALL 1 — Intent Extraction                         │
│  Model: gemini-1.5-flash                            │
│  Mode: JSON response schema enforced                │
│  Input: goal text + allowed intent types +          │
│         allowed parameter names (no field ops)      │
│  Output: {intent_type, parameters: {dormancyDays,   │
│           minOrders, ...}, confirmation_text}       │
│  Latency target: < 2s                               │
│                                                     │
│  NOTE: LLM outputs parameters only.                 │
│  CRM Service maps intent → MongoDB query            │
│  using a hardcoded whitelist. No MongoDB            │
│  operators are ever generated by the LLM.           │
└──────────────────────┬──────────────────────────────┘
                       │
        [HUMAN GATE 1 — Intent Confirmation]
        Marketer reads confirmation_text, adjusts if needed
        (Edits map to pre-defined parameter overrides,
         not free-form query changes)
                       │
                       ▼
              Execute audience query
              (CRM whitelist → MongoDB, no LLM)
              Return: count + aggregate stats
              Campaign saved as DRAFT to MongoDB
              (browser-refresh-safe from this point)
                       │
        [HUMAN GATE 2 — Audience Review]
        Marketer sees count + sample, confirms
                       │
          ┌────────────┴──────────────────┐
          ▼                               ▼
┌─────────────────────┐   ┌──────────────────────────┐
│  CALL 2 — Narrative │   │  CALL 3 — Message Gen    │
│  + Cluster Defs     │   │                          │
│  Model: 1.5-flash   │   │  Model: gemini-1.5-pro   │
│  Input: agg stats   │   │  Input: cluster profiles │
│  Output: narrative  │   │  + brand voice + goal    │
│  + cluster defs     │   │  Output: per-cluster     │
│  Latency: < 3s      │   │  messages + rationale    │
└──────────┬──────────┘   │  Latency: < 5s           │
           │              └───────────┬──────────────┘
           │                          │
           │  PROGRESSIVE DISPLAY:    │
           │  Call 2 renders          │  Skeleton loaders
           │  immediately on return   │  shown in message
           │  (audience narrative +   │  section while
           │  cluster cards visible)  │  Call 3 completes
           │                          │
           └─────────────┬────────────┘
                         │ (Call 3 results replace skeleton loaders)
                         ▼
              Rule checks (no LLM)
              Channel recommendation (no LLM)
              Revenue estimate (formula, no LLM)
              Campaign promoted: DRAFT → READY_FOR_REVIEW
                         │
                         ▼
┌─────────────────────────────────────────────────────┐
│  CALL 4 — Contextual Critique                       │
│  Model: gemini-1.5-flash                            │
│  Input: campaign summary + rule-check outputs       │
│  Output: {flags: [{level, message, suggestion}]}    │
│  Max 3 flags returned. Capped at the prompt level.  │
│  Latency: < 2s                                      │
└──────────────────────┬──────────────────────────────┘
                       │
        [MARKETER REVIEWS — edits messages, channels]
        [Campaign is READY_FOR_REVIEW in DB]
        [LAUNCH BUTTON ENABLED]
                       │
                       ▼
              Campaign launches
              Status: READY_FOR_REVIEW → LAUNCHING → ACTIVE
              (dispatch jobs queued)
                       │
              (T+48h later)
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│  CALL 5 — Post-Campaign Report                      │
│  Model: gemini-1.5-pro                              │
│  Trigger: background job after COMPLETED status     │
│  Input: full funnel data + per-cluster breakdown    │
│  Output: narrative + next action recommendation     │
│  Latency: < 8s (async, not blocking any UI)         │
└─────────────────────────────────────────────────────┘
```

### 5.2 Gemini Model Selection

| Call | Model | Reason |
|---|---|---|
| 1 (Intent) | gemini-1.5-flash | Speed critical — user is waiting. Task is structured parameter extraction. Flash is sufficient and stable. |
| 2 (Narrative) | gemini-1.5-flash | Speed critical — renders immediately on return while Call 3 completes. Narrative generation from structured stats. |
| 3 (Messages) | gemini-1.5-pro | Quality critical — the marketer will read and judge this output. Slightly slower is acceptable. |
| 4 (Critique) | gemini-1.5-flash | Speed. The critique should appear quickly. Task is flag extraction, not creative writing. |
| 5 (Report) | gemini-1.5-pro | Quality critical — the post-campaign report is a key WOW moment. Latency is irrelevant (async). |

**Model stability note:** All model names use stable release identifiers. Experimental (`-exp`) or preview variants are not used. Before go-live, verify each model ID is active in the [Google AI Studio model list](https://ai.google.dev/gemini-api/docs/models/gemini). If `gemini-1.5-pro` has been superseded by a stable `gemini-2.0-pro`, update Calls 3 and 5 to the newer stable version.

**Alternative considered:** Use a single model (gemini-1.5-pro) for all calls.  
**Rejected:** gemini-1.5-pro adds 2–4 seconds of latency per call. For Calls 1, 2, and 4, this is noticeable and unnecessary. The flash/pro split by task is the correct engineering decision.

### 5.3 Structured Output Contract

All Gemini calls use the `responseMimeType: "application/json"` parameter with an explicit `responseSchema`. This enforces the JSON structure at the API level — the response is guaranteed to parse. Calls that return malformed JSON despite this (which should not happen but can under rare conditions) trigger one automatic retry; after that, an in-process default is used and the failure is logged.

The `responseSchema` for each call is defined in `src/services/ai/schemas/` and is version-matched to the prompt version.

### 5.4 Prompt Engineering Approach

Each prompt file (`src/prompts/intent-v1.txt`) contains:
1. **Role definition** — what the model is in this context
2. **Allowed intent types** — enumerated list of valid `intent_type` values the model may return
3. **Allowed parameter names** — for Call 1, the exact parameter names (e.g., `dormancyDays`, `minOrders`) the model may populate. No MongoDB operators, no field names, no query syntax.
4. **Output schema** — the expected JSON structure, described in prose and with a concrete example
5. **Constraints** — explicit rules (e.g., "never include MongoDB operators", "cap critique flags at 3")
6. **Brand voice injection point** — `{{brand_voice}}` placeholder substituted at runtime

Prompts are not constructed by string concatenation in business logic. They are loaded once at startup and parameterized via template substitution. This makes prompt changes reviewable in git without touching application code.

---

## 6. Queue Design

### 6.1 Design Decision

**Chosen approach: MongoDB-backed job queue with polling**

The CRM Service writes `dispatch_jobs` documents. The Channel Service polls the `dispatch_jobs` collection every 2 seconds for documents with `status: "queued"`, claims them atomically with `findOneAndUpdate({ status: "queued" }, { $set: { status: "processing" } }, { sort: { createdAt: 1 } })`, processes them, and sets status to `done` or `failed`.

**Alternative 1 considered: Redis + BullMQ**  
Rejected. Adds Redis as an infrastructure dependency. Requires provisioning a Redis instance on Render or using a third-party provider (Redis Cloud free tier). Adds connection management, retry configuration, and deployment complexity. Solves a scale problem that doesn't exist at demo scale. The MongoDB-backed queue achieves the same properties: durability, at-least-once delivery, retry on failure, and an auditable dead-letter state.

**Alternative 2 considered: MongoDB Change Streams**  
Partially rejected. Change Streams (MongoDB's equivalent of `pg_notify`) would eliminate the polling overhead and give near-instant job pickup. However, Change Streams require a replica set. Atlas M0 free tier does provide a replica set, so this is technically feasible. Rejected because: polling every 2 seconds has negligible overhead at demo scale, is simpler to implement and debug, and needs no special connection handling. Noted as a valid production upgrade.

**Alternative 3 considered: HTTP push from CRM to Channel Service**  
Rejected. Creates tight coupling between services. If the Channel Service is down when a campaign launches, messages are lost. The queue provides durability — jobs survive a Channel Service restart.

### 6.2 Atomicity of Job Pickup

The Channel Service worker uses `findOneAndUpdate` with the query `{ status: "queued" }` and the update `{ $set: { status: "processing", lastAttemptedAt: now } }`. MongoDB's `findOneAndUpdate` is atomic — two concurrent workers cannot pick the same job. This matters only if the Channel Service is scaled horizontally (not relevant for demo, relevant for production).

### 6.3 Retry and Dead-Letter Logic

```
Attempt 1: process job
  → success: status = "done"
  → failure: status = "queued", attempts++, error = message

Attempt 2 (next poll): process job (attempts = 2)
  → success: status = "done"
  → failure: status = "queued", attempts++

Attempt 3 (next poll): process job (attempts = 3)
  → success: status = "done"
  → failure: status = "failed", error = message (dead-lettered)

Dead-lettered jobs: visible in import_jobs log, 
callback fired with status="failed" to CRM
```

### 6.4 Campaign Launch — Fan-Out Write

When a campaign launches, the CRM Service creates one `dispatch_jobs` document per customer per channel assignment. For a 1,000-customer audience, this is 1,000 writes. MongoDB `insertMany` handles this in a single operation. The campaign transitions from `LAUNCHING` to `ACTIVE` once the fan-out write completes successfully.

---

## 7. Async Callback Flow

### 7.1 Full Sequence

```
1. Channel Service picks dispatch_job from queue
2. Channel Service routes to channel adapter (email/whatsapp/sms)
3. Adapter "sends" the message (real or simulated)
4. Adapter generates status event: SENT
5. Channel Service fires callback:
   POST {callbackUrl}
   Payload: {messageId, customerId, channel, status, timestamp}
   Headers: X-Xeno-Signature: HMAC-SHA256(payload, campaignHmacSecret)

6. CRM Service callback handler:
   a. Validates HMAC signature — reject with 401 if invalid
   b. Finds campaign_messages document by messageId
   c. Updates status + timestamps
   d. Increments campaign_clusters.stats counter for the matching cluster
   e. Checks opt-out: if status = "opt_out", add channel to customer.optOutChannels

7. Adapter fires subsequent status events with delay simulation:
   DELIVERED (5–30s after SENT for mock providers)
   OPENED    (30s–3min after DELIVERED)
   CLICKED   (if customer "clicks" — simulated 40% of opened)

8. Frontend polls GET /campaigns/{id}/stats every 3 seconds
   Response: {funnel: {sent, delivered, failed, opened, clicked, converted}, clusters: [...]}
   UI updates delivery funnel bars
```

### 7.2 Click Tracking

Clicked status is tracked via link rewriting, not an LLM or channel provider feature.

At dispatch time, before writing the `dispatch_jobs` document, the CRM Service replaces the CTA URL in the message body with a tracking redirect:

```
Original: https://raga.in/new-collection
Replaced: https://xeno-crm.onrender.com/track/click/{messageId}
```

When the customer clicks, the CRM Service:
1. Records the click event (sets `clickedAt` on `campaign_messages`)
2. Increments the cluster's `clicked` counter
3. Redirects the customer to the original CTA URL (stored on the `campaign_messages` document)

This is a fully owned tracking mechanism requiring no external service.

### 7.3 HMAC Security

Each campaign generates a unique `hmacSecret` at launch (`crypto.randomBytes(32).toString('hex')`). This secret is stored on the `campaigns` document and is included in every `dispatch_jobs` document for that campaign.

The Channel Service signs each callback payload:
```
signature = HMAC-SHA256(JSON.stringify(payload), hmacSecret)
Header: X-Xeno-Signature: <signature>
```

The CRM callback handler computes the expected signature and compares with `crypto.timingSafeEqual`. Timing-safe comparison prevents timing attacks. Callbacks with invalid signatures are rejected with `401 Unauthorized` and logged.

---

## 8. Real-Time Updates Strategy

### 8.1 Decision: Frontend Polling

**Chosen approach:** Frontend polls `GET /api/v1/campaigns/{id}/stats` every **3 seconds** while the campaign detail screen is visible.

**Alternative considered: Server-Sent Events (SSE)**  
SSE would push status updates from the CRM Service to the frontend as callbacks arrive — eliminating the polling lag. Chosen as a P1 enhancement, not P0. Reason: SSE requires keeping HTTP connections alive on Render, which has limitations on the free tier. Polling every 3 seconds is imperceptible to a human watching a funnel update and is trivially reliable. Build SSE after the core product works.

**Alternative considered: WebSockets**  
Rejected. Bidirectional is unnecessary — the flow is server-to-client only. Adds socket lifecycle management with no benefit over SSE for this use case.

**Polling implementation:** The Campaign Detail screen component uses a `useEffect` with `setInterval`. The interval is cleared when the campaign status reaches `completed` or `failed`, or when the component unmounts. The endpoint returns a compact aggregated stats object — it is not a full campaign document fetch.

---

## 9. Background Jobs

Background jobs run within the CRM Service process using `setInterval`. No external job scheduler is introduced.

### 9.1 RFM Compute Job

**Trigger:** Fires after every customer or order ingestion batch completes. Event-driven, not scheduled.

**Rule: Full recompute. Always. No partial updates.** (See §4.3 for rationale — partial updates produce incorrect quintile scores due to shifting global boundaries.)

**What it does:**
1. Aggregates the `orders` collection: `$group by customerId` → `lastOrderAt`, `totalOrders`, `totalSpend`
2. Loads the complete result set into memory
3. Sorts the full customer list three ways (by R, F, M) to compute quintile bucket boundaries
4. Assigns `rfmR`, `rfmF`, `rfmM` (1–5) and `rfmSegment` label for every customer
5. Bulk-updates all customer documents in one `bulkWrite` operation (unordered for speed)

**Not called synchronously.** The ingestion API returns immediately. The RFM job fires as a background callback. The response includes `{ status: "ingestion_complete", rfmRecomputeQueued: true }`. The frontend can poll `GET /api/v1/jobs/{importJobId}` to check completion.

**V1 scale:** 1,000 customers + 3,000 orders — full recompute completes in under 300ms.

### 9.2 Conversion Detection Job

**Trigger:** `setInterval` every 30 minutes within the CRM Service.

**What it does:**
```
1. Find all campaigns with status "ACTIVE" and launchedAt within the last 14 days
   (attribution window not yet expired)
2. For each ACTIVE campaign:
   a. Get all customer IDs in the campaign (from campaign_messages, grouped by customerId)
   b. Find orders with orderDate > campaign.launchedAt
      AND orderDate < (launchedAt + 14 days)
      AND customerId in campaign customer list
      AND campaignAttributedTo is null
   c. For each matching order:
      - Set order.campaignAttributedTo = campaignId
      - Set campaign_messages status = "converted" + convertedAt = orderDate
      - Increment campaign_clusters.stats.converted for the customer's cluster
3. If a campaign's launchedAt is > 14 days ago and status is still "ACTIVE",
   mark as "COMPLETED"
4. After marking "COMPLETED", update channel_stats aggregates for that campaign's channels
```

**Why 30 minutes and not real-time?** Conversion requires a new order to be ingested via the CRM's own ingestion API. The brand must actively push orders. For a demo, orders are pre-seeded and conversions are visible immediately. In production, a webhook from the POS/e-commerce platform would trigger near-real-time conversion detection.

### 9.3 Post-Campaign Report Job

**Trigger:** Runs as part of the Conversion Detection job, after a campaign is marked `COMPLETED`. Checks: `aiReport` is null AND `completedAt` > 48 hours ago (for demo: `completedAt` is set to 48 hours in the past for pre-seeded campaigns, making the report immediately available).

**What it does:** Calls LLM Call 5 with the campaign's funnel data and per-cluster breakdown. Stores the narrative in `campaigns.aiReport`.

---

## 10. Deployment Architecture

### 10.1 Services and Hosting

| Service | Host | Plan | URL Pattern |
|---|---|---|---|
| Frontend | Vercel | Free (Hobby) | `https://xeno-copilot.vercel.app` |
| CRM Service | Render | Starter ($7/mo) | `https://xeno-crm.onrender.com` |
| Channel Service | Render | Starter ($7/mo) | `https://xeno-channel.onrender.com` |
| Database | MongoDB Atlas | M0 (Free) | `mongodb+srv://...atlas.mongodb.net` |

**Why Render Starter ($7/mo) over Free?**  
Render's free tier suspends services after 15 minutes of inactivity and takes 30–60 seconds to spin up on the next request. For a demo walkthrough, a 45-second blank screen while the backend starts is a demo-killer. The Starter plan keeps the service always-on. At $14/month total for two services, this is worth it for the duration of the internship evaluation. This is noted explicitly — not because it is expensive but because it is the correct professional decision.

**Alternative considered:** Use Render free tier with a keep-alive ping (UptimeRobot).  
Rejected. UptimeRobot pings on a timer; there is still a spin-up delay if the ping gaps align with the demo window. Reliable always-on is worth $14/month for a submission that determines career trajectory.

### 10.2 Repository Structure

Three separate GitHub repositories as required by the assignment:

```
github.com/{username}/xeno-copilot-frontend    → Vercel
github.com/{username}/xeno-copilot-crm         → Render (CRM Service)
github.com/{username}/xeno-copilot-channel     → Render (Channel Service)
```

**Monorepo considered and rejected.** A monorepo with separate deployment targets is viable but adds CI/CD configuration complexity (path-based deploy triggers). Three separate repos with independent deployments are simpler to set up and debug in 3–4 days, and satisfy the assignment requirement of distinct GitHub repository URLs.

### 10.3 Environment Variables

**CRM Service (Render):**
```
NODE_ENV=production
PORT=8080
MONGODB_URI=mongodb+srv://...
GEMINI_API_KEY=...
SENDGRID_API_KEY=...
CHANNEL_SERVICE_URL=https://xeno-channel.onrender.com
FRONTEND_URL=https://xeno-copilot.vercel.app  # for CORS
DEMO_API_KEY=...  # simple auth for demo (see §11)
```

**Channel Service (Render):**
```
NODE_ENV=production
PORT=8080
MONGODB_URI=mongodb+srv://...  # same Atlas cluster
SENDGRID_API_KEY=...
CRM_SERVICE_BASE_URL=https://xeno-crm.onrender.com  # for callbacks
```

**Frontend (Vercel):**
```
NEXT_PUBLIC_API_URL=https://xeno-crm.onrender.com
NEXT_PUBLIC_DEMO_API_KEY=...  # same as CRM DEMO_API_KEY
```

**Critical:** `MONGODB_URI`, `GEMINI_API_KEY`, and `SENDGRID_API_KEY` are never committed to any repository. They are configured only through the Render and Vercel environment variable settings UI.

### 10.4 Deployment Flow

```
Frontend:  git push → Vercel auto-deploys (Next.js native)
CRM:       git push → Render auto-deploys (detected as Node.js)
Channel:   git push → Render auto-deploys (detected as Node.js)
Database:  Provisioned once on Atlas, connection string shared
```

No CI/CD pipeline is configured. Direct push-to-deploy via Render and Vercel built-in integration. This is intentional for a 3-day build — configuring GitHub Actions adds time with no benefit for a single-developer project.

### 10.5 Startup and Health

Each backend service exposes:
- `GET /health` — returns `{ status: "ok", service: "crm", timestamp }` — used for Render health checks and manual verification
- `GET /` — returns service name and version — prevents blank responses on browser open

The CRM Service initializes on startup:
1. Connect to MongoDB Atlas (retry 3 times with backoff)
2. Ensure indexes exist (idempotent — safe to run on every start)
3. Start background jobs (RFM compute registration, conversion detection interval)
4. Start Express server

---

## 11. Security Boundaries

This is a demo product, not a production multi-tenant SaaS. Security is proportionate to that context. The following are implemented; the rest are documented as production requirements.

### 11.1 Implemented in V1

**API Authentication (Demo-grade):**  
All CRM Service API endpoints require an `Authorization: Bearer {DEMO_API_KEY}` header. The key is a 32-character random string set as an environment variable. The frontend reads it from `NEXT_PUBLIC_DEMO_API_KEY`. This prevents casual unauthorized access without requiring a full auth system.

This is explicitly not production authentication. A production system would use JWT with refresh tokens, or an OAuth2 provider. Documented here so an evaluator asking about auth gets a specific answer.

**Callback HMAC Verification:**  
Described in §7.3. Every inbound callback from the Channel Service is signature-verified. This is production-grade and implemented fully.

**TLS Everywhere:**  
All service-to-service communication uses HTTPS. MongoDB Atlas connections use TLS. Vercel, Render, and Atlas all enforce TLS on public endpoints. No plaintext communication anywhere.

**Opt-Out Enforcement:**  
Before any `dispatch_jobs` document is written, the CRM Service filters out customers whose `optOutChannels` includes the campaign's target channel. This check is at the business logic layer, not the database layer — belt-and-suspenders: the audience query also excludes opted-out customers.

**Input Validation:**  
CSV imports validate phone format (E.164), email format, date formats, and numeric ranges for order amounts. API ingestion validates schema against a Zod schema before any database write. Invalid records are reported, not silently skipped.

### 11.2 Production Requirements (Not Built in V1)

| Gap | Production Solution |
|---|---|
| User authentication | JWT + refresh tokens or Auth0/Clerk |
| Multi-tenant data isolation | `brandId` field on all documents + middleware-enforced query scoping |
| Rate limiting | express-rate-limit per API key |
| CSV injection | Sanitize cell values that begin with `=`, `+`, `-`, `@` |
| LLM prompt injection | Sanitize goal text before LLM injection — strip prompt-injection patterns |
| Secrets rotation | Environment variable updates via Render/Vercel; Atlas credential rotation |
| Audit logging | Append-only log of all campaign launches and data modifications |

---

## 12. Error Handling Strategy

### 12.1 Principles

1. **Never silently swallow errors.** Every caught error is either surfaced to the user (if actionable) or logged (if internal). `catch (e) { }` is prohibited.
2. **Fail fast at boundaries.** Validate all inputs at ingestion and API boundaries. Reject bad data early with a clear message rather than letting it corrupt downstream.
3. **Degrade gracefully in the AI pipeline.** If an LLM call fails, show the user what succeeded and offer a "Try again" for the failed step. Do not abort the entire campaign creation flow.
4. **The Channel Service never causes data loss.** A failed dispatch job stays in the queue for retry. A job that exceeds max retries is marked `failed` and a callback is fired to the CRM to update the message status. The campaign funnel always reflects reality.

### 12.2 Express Error Handler

All routes use `try/catch` and pass errors to a centralized Express error handler. The handler:
- Logs the full error (stack trace) to the console (Render captures this)
- Returns a clean `{ error: { code, message } }` JSON response with the appropriate HTTP status
- Never exposes stack traces in the response body

### 12.3 LLM Error States

| Scenario | Behavior |
|---|---|
| Gemini API unavailable | Retry once after 2s. If still failing, return `{ error: "AI service temporarily unavailable. Try again." }` |
| Malformed JSON response | Retry once. If still malformed, return the best-effort parsed fragment and flag it for the user. |
| Intent unclassifiable | Return `CUSTOM` intent type with a confirmation prompt asking the user to clarify. |
| Audience = 0 | Return to the user with suggested filter relaxations. Do not proceed to message generation. |
| Post-campaign report fails | Retry up to 3 times over 24 hours (scheduled in the background job). If all fail, show a static fallback message: "Campaign analytics are available above. AI narrative report is temporarily unavailable." |

### 12.4 Ingestion Error Handling

CSV rows with validation errors do not block the import. Valid rows are imported; invalid rows are collected and returned in the import report. The import is considered successful if at least 1 row imports successfully. An import report document is written to `import_jobs` with full per-row error detail.

### 12.5 Frontend Error States

Every API call from the frontend uses a shared `apiClient` that:
- Shows a toast notification on network error
- Shows inline error state within the component on API error responses
- Never leaves the user on a blank screen due to an unhandled promise rejection

---

## 13. Scalability Notes

This section is written for the interview, not for day-3 implementation. The architecture is designed with production headroom even if that headroom is not activated in V1.

### 13.1 What Scales Without Changes

| Component | Scaling Path |
|---|---|
| Frontend (Vercel) | CDN-distributed static assets, Edge functions where needed. No changes required. |
| CRM Service (Render) | Horizontal scaling via Render's scaling settings. Express is stateless — no session state. Background jobs need deduplication if running on multiple instances (see §13.3). |
| Channel Service (Render) | Horizontal scaling. The `findOneAndUpdate` atomic claim in the queue worker ensures no double-processing. |
| MongoDB Atlas | Vertical scaling: M0 → M10 → M20. Atlas handles sharding for very large datasets. Index strategy is already production-appropriate. |

### 13.2 What Requires Changes for Production Scale

**RFM full-recompute on every ingestion:**  
At 1M+ customers, a full quintile recompute on every batch import is unacceptable. Production solution: maintain a materialized `rfm_quintile_boundaries` document, recompute boundaries on a daily schedule, and update only affected customers incrementally.

**Fan-out write at campaign launch:**  
Writing 500,000 `dispatch_jobs` documents in a single `insertMany` would take several seconds and create a large queue spike. Production solution: paginated fan-out using a cursor, writing dispatch jobs in batches of 5,000 with a short delay between batches to avoid queue flooding.

**Background jobs on multiple instances:**  
If the CRM Service runs on 2+ instances, the conversion detection job runs concurrently. Two instances could attribute the same order to the same campaign twice. Production solution: use a distributed lock (Redis `SET NX` or MongoDB `findOneAndUpdate` on a lock document) before running the conversion job. For V1 (single instance), this is not needed.

**Callback throughput:**  
The CRM callback handler receives one POST per status change per message. For a campaign of 100,000 messages, that could be 300,000–500,000 callbacks. The callback handler must be non-blocking and idempotent. V1 implementation: simple `findOneAndUpdate`. Production: consider batching callback updates using a write buffer that flushes every 500ms.

### 13.3 Multi-Tenancy Path

All collections include a `brandId` field (not yet used in V1). To activate multi-tenancy:
1. Add `brandId` to every query in the CRM Service (enforce via middleware)
2. Add `brandId` index to every collection
3. Issue per-brand API keys mapped to `brandId`

No schema migration is required — MongoDB's flexible schema means adding `brandId` to queries immediately starts filtering correctly (documents without `brandId` would only be returned if `brandId` is not in the query, which the middleware would prevent).

---

## 14. Architectural Decision Records

Each decision is documented with: what was chosen, what was rejected, and why.

---

### ADR-001: MongoDB over PostgreSQL

**Context:** PRD was authored with PostgreSQL in mind (SQL predicates, window functions, pg_notify). Tech stack mandates MongoDB.

**Decision:** MongoDB Atlas. Accept the constraint, adapt the design.

**Adaptations required:**
- LLM extracts intent parameters only; CRM Service maps to MongoDB queries via a safe whitelist (never generates MongoDB operators)
- RFM quintile computation moves from SQL `PERCENT_RANK()` to an application-layer full-recompute sort-and-bucket function
- Queue polling replaces pg_notify (polling every 2s is sufficient at demo scale)
- Analytics use MongoDB aggregation pipeline instead of SQL GROUP BY

**Why MongoDB is actually fine here:**  
Document-oriented data maps naturally to customer profiles with embedded computed fields. The aggregation pipeline handles all required analytics. Atlas M0 is free and trivially deployable. The adaptations are straightforward and do not compromise any product functionality.

---

### ADR-002: Gemini over Claude / GPT-4o

**Context:** PRD referenced Claude claude-sonnet-4-6. Tech stack mandates Gemini API.

**Decision:** Gemini API. `gemini-1.5-flash` for speed-sensitive calls, `gemini-1.5-pro` for quality-sensitive calls. Stable model names only — no experimental or preview variants.

**Why Gemini works well here:**
- JSON mode (`responseMimeType: "application/json"`) with explicit `responseSchema` provides the same structured output guarantee as OpenAI's structured output mode
- `gemini-1.5-flash` is a production-stable fast model suitable for structured classification and extraction tasks
- Generous free tier for development; low cost per call in production
- Function calling available for complex multi-step reasoning if needed

**One risk:** Gemini's instruction-following on complex multi-constraint prompts can be less reliable than GPT-4 on certain tasks. Mitigated by: explicit response schema enforcement, one retry on malformed output, and deterministic rule checks for the most critical decisions (critique, channel selection).

---

### ADR-003: Database-backed Queue over Redis + BullMQ

**Context:** PRD recommended database-backed queue as a pragmatic choice for 3-day build.

**Decision:** `dispatch_jobs` MongoDB collection with polling every 2 seconds.

**Alternatives rejected:**
- Redis + BullMQ: adds infrastructure dependency, deployment complexity, connection management, no benefit at demo scale
- MongoDB Change Streams: technically feasible, but more complex to implement and debug than simple polling; polling is sufficient

**Production upgrade path:** Replace the `setInterval` poll with a MongoDB Change Stream watch on the `dispatch_jobs` collection. This eliminates polling overhead and gives near-instant job pickup. The adapter interface does not change.

---

### ADR-004: Polling over SSE/WebSockets for Real-Time Updates

**Context:** Campaign detail screen needs live delivery funnel updates.

**Decision:** Frontend polls `GET /campaigns/{id}/stats` every 3 seconds.

**Why:** Polling every 3 seconds produces a smooth-looking live update with minimal implementation complexity. The Channel Service sends mock callbacks every 5–30 seconds — polling at 3s captures these with one poll-cycle lag, which is invisible to a human watching the screen.

**Production upgrade path:** Add an SSE endpoint `GET /campaigns/{id}/events` that streams status events as they arrive. Frontend subscribes when viewing the campaign detail page. The SSE handler is a straightforward `res.write()` inside the callback handler.

---

### ADR-005: No BFF Layer in Next.js

**Context:** Next.js supports API routes that could act as a Backend-for-Frontend, proxying calls to the CRM Service.

**Decision:** Frontend calls CRM Service directly. No Next.js API routes used as proxies.

**Why rejected:** An API proxy layer adds a network hop, doubles the surface area for debugging, and provides no value in a single-developer project with a single frontend. CORS is configured on the Express CRM Service to allow `NEXT_PUBLIC_FRONTEND_URL`. This is sufficient.

**When a BFF would be right:** If the frontend needed to aggregate data from multiple backend services, hide internal URLs from the browser, or enforce additional authentication logic that the backend doesn't own — none of which apply here.

---

### ADR-006: Rule-Based RFM Clustering over K-Means

**Context:** PRD eliminated k-means in favor of rule-based RFM quintile binning.

**Decision:** RFM quintile binning with a fixed 6-segment lookup table.

**Why this is architecturally correct:** The segmentation logic is a pure function: `(rfmR, rfmF, rfmM) → segment_label`. It has no external dependencies, no training data, no hyperparameters. It runs in microseconds. It is fully testable. It produces the same result on every run. These properties make it the correct engineering choice for a system where campaign execution depends on its output.

---

### ADR-007: Render Starter Plan over Free Tier

**Context:** Render's free tier suspends services after 15 minutes of inactivity with a 30–60 second cold start.

**Decision:** Render Starter ($7/month per service) for always-on deployment.

**Why:** A cold start during a live demo walkthrough or evaluator review is a fatal user experience failure. The $14/month cost for both backend services is negligible relative to the evaluation outcome. This is a professional judgment call, not a cost optimization problem.

---

## 15. Priority: What Is and Is Not Built

### P0 — Must Be Working on Demo Day

| Component | Rationale |
|---|---|
| Customer + Order CSV ingestion | Assignment requirement. Foundation for all AI features. |
| Customer + Order API ingestion | Assignment requirement. |
| RFM computation + segment assignment | Enables audience discovery and behavioral clustering. |
| AI campaign creation flow (5 LLM calls) | The core product thesis. The WOW moment. |
| Human Gate 1 + Gate 2 in campaign flow | Safety and trust. Non-negotiable. |
| Campaign launch → dispatch job fan-out | Required for any message delivery. |
| Channel Service polling loop | Required for message dispatch. |
| Email delivery via SendGrid | Real delivery in demo. At least one channel must be real. |
| WhatsApp + SMS mock adapters | Satisfies channel requirement without API approval delays. |
| Async callback → CRM status update | Required for delivery funnel. |
| HMAC callback verification | Security correctness signal for evaluators. |
| Click tracking via link rewriting | Required for "Clicked" status in funnel. |
| Conversion detection background job | Required for "Converted" status and revenue attribution. |
| Campaign delivery funnel display (polling) | Core analytics view. The live funnel is a demo WOW moment. |
| Audience Health dashboard | High-impact screen. Surfaces dormancy insight immediately. |
| AI post-campaign report (T+48h) | Closes the campaign loop. Critical for demo narrative. |
| Demo seed data ("Raga" brand) | Without this, every AI recommendation is cold-start and low-confidence. |
| Goal templates on command bar | Lowers barrier to first demo campaign. Makes demo reproducible. |
| Pre-launch critique (rules + LLM) | Differentiates the product. Shows the AI understands risk, not just execution. |

### P1 — Build After P0 Is Stable

| Component | Rationale |
|---|---|
| Manual segment builder | Fallback for marketers who prefer control. Nice to have, not WOW. |
| Campaigns list screen | Needed for navigation, but not a WOW moment. |
| Import history screen | Operational. Lower priority than the AI flow. |
| Settings screen (brand voice config) | Required for message quality but defaults work for demo. |

### Intentionally Not Built

| Component | Reason |
|---|---|
| Server-Sent Events / WebSockets | Polling at 3s is sufficient. SSE is a clean P1 upgrade path. |
| Redis + BullMQ | DB-backed queue is sufficient. No added value at demo scale. |
| Multi-tenancy activation | Single brand in demo. Architecture supports it; not wired up. |
| K-means clustering | Rule-based RFM is superior for interpretability. K-means removed. |
| Real WhatsApp Business API | Production access not achievable in 3-4 days. Mock is architecturally equivalent. |
| Recurring campaign schedules | Out of scope per PRD. Requires job scheduler. |
| A/B test framework | Out of scope per PRD. Cannot produce valid results at demo scale. |
| Full auth system (JWT, sessions) | Demo API key is sufficient. Full auth would take 0.5+ days to implement correctly. |
| GDPR / consent management | Out of scope per PRD. Required for production. Documented as production debt. |

---

*Document Status: Version 1.0 — Complete. Next: DATABASE_SCHEMA.md*
