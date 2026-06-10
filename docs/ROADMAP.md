# Development Roadmap

**Version:** 1.0  
**Timeline:** 4 days (one developer)  
**Goal:** Working deployed demo optimised for interview performance and shortlist probability  
**Thesis:** Ship the AI campaign creation flow first. Everything else supports it.

---

## Table of Contents

1. [Execution Philosophy](#1-execution-philosophy)
2. [Repository Structure](#2-repository-structure)
3. [Day 1 — Foundation](#3-day-1--foundation)
4. [Day 2 — AI Pipeline](#4-day-2--ai-pipeline)
5. [Day 3 — Campaign Execution + Frontend Core](#5-day-3--campaign-execution--frontend-core)
6. [Day 4 — Polish, Deploy, Demo](#6-day-4--polish-deploy-demo)
7. [Backend Build Order](#7-backend-build-order)
8. [Frontend Build Order](#8-frontend-build-order)
9. [AI Integration Order](#9-ai-integration-order)
10. [Deployment Order](#10-deployment-order)
11. [Critical Path](#11-critical-path)
12. [Risks and Mitigations](#12-risks-and-mitigations)
13. [Demo Preparation Plan](#13-demo-preparation-plan)
14. [Cut List — Features Removable Under Time Pressure](#14-cut-list--features-removable-under-time-pressure)
15. [Definition of Done](#15-definition-of-done)

---

## 1. Execution Philosophy

### The One Rule

**The AI campaign creation flow is the product.** Everything else — analytics dashboards, import jobs, customer lists — is set dressing. A polished campaign creation flow with rough analytics beats polished analytics with a broken AI flow.

If time runs short, cut from the outside in. The demo must end with the evaluator having watched:
1. User types a natural-language goal.
2. AI confirms intent (Gate 1).
3. Audience narrative + persona cards appear.
4. Messages appear per cluster (Gate 2).
5. Campaign launches.
6. Delivery stats update.

That 6-step sequence is the entire product thesis. Every build decision should protect it.

### Time Budget

| Day | Allocation | Hours (realistic) |
|-----|------------|-------------------|
| Day 1 | Foundation — backend only | 8–10h |
| Day 2 | AI Pipeline — backend only | 8–10h |
| Day 3 | Campaign Execution + Frontend core | 10–12h |
| Day 4 | Polish, deployment, demo prep | 8–10h |

Estimate generously. Infrastructure always takes longer than expected. Gemini API integration always has surprises. Render cold starts will need to be solved.

### Non-Negotiable Checkpoints

These must be true at the end of each day. If a checkpoint is missed, re-scope the next day before adding new work.

| Day | Checkpoint |
|-----|-----------|
| End of Day 1 | `POST /import` accepts a CSV, stores 1,000 customers + 3,000 orders, RFM scores are correct in MongoDB |
| End of Day 2 | `POST /campaigns/intent-extract` through `POST /campaigns/:id/audience-preview` works end-to-end, campaign saved as DRAFT in MongoDB |
| End of Day 3 | Campaign can be launched, dispatch jobs are processed, mock delivery callbacks update communication_events, frontend campaign creation flow is navigable |
| End of Day 4 | App is live on Vercel + Render, demo script runs without errors, all environment variables set |

---

## 2. Repository Structure

Three separate repositories as specified in SYSTEM_ARCHITECTURE.md:

```
xeno-copilot-frontend/       ← Next.js 14 App Router (Vercel)
xeno-copilot-crm/            ← Node.js + Express (Render Starter, $7/mo)
xeno-copilot-channel/        ← Node.js + Express (Render Starter, $7/mo)
```

**Shared MongoDB Atlas M0 cluster** — all three services connect to the same cluster. No separate databases per service in V1.

**Monorepo is explicitly rejected.** Three separate repos means three separate deployments, three separate environment variable scopes, and no shared code that creates accidental coupling. The slight inconvenience of managing three repos is worth the architectural clarity during an interview.

### Initialise All Three Repos First

Before any feature work, spend 30 minutes initialising all three repositories with their package.json, tsconfig, .env.example, and basic Express/Next.js skeleton. This prevents the "I'll set up the other repo later" trap that always leads to last-minute deployment scrambles.

---

## 3. Day 1 — Foundation

**Theme:** Get data in. Get RFM working. Nothing flashy.

**Why this order:** The entire product is downstream of having real customer data with correct RFM scores. The seed data is the demo. Without it, the AI pipeline has nothing to say.

### Morning Block (Hours 1–4): Infrastructure

#### 1. MongoDB Atlas M0 Setup (30 min)
- Create cluster on MongoDB Atlas free tier.
- Create database `xeno_copilot`.
- Create database user with read/write on `xeno_copilot`.
- Add connection string to `xeno-copilot-crm/.env`.
- Whitelist `0.0.0.0/0` (allow all IPs — acceptable for demo, note the security tradeoff).
- Test connection with `mongosh`.

#### 2. CRM Service Skeleton (45 min)
Create `xeno-copilot-crm` with:
- `package.json`: express, mongoose, dotenv, cors, helmet, morgan, multer, csv-parse, node-cron, @google/generative-ai
- `tsconfig.json` targeting Node.js 18+
- `src/index.ts`: Express app with cors, helmet, morgan, JSON body parser
- `src/config/db.ts`: Mongoose connection with retry logic
- `src/middleware/auth.ts`: Bearer token middleware (reads `API_SECRET_TOKEN` from env)
- `src/middleware/errorHandler.ts`: Consistent error response envelope from API_SPEC.md
- `.env.example`: all required variables
- Health check route: `GET /health` returns `{ status: "ok" }`

Start the server. Confirm health check returns 200 before moving on.

#### 3. Channel Service Skeleton (30 min)
Create `xeno-copilot-channel` with:
- Same dependencies minus multer and csv-parse; add node-cron
- `src/index.ts`: Express app
- `src/config/db.ts`: Same Mongoose connection (shared Atlas cluster)
- Health check: `GET /health`

Start the server on a different port. Confirm health check returns 200.

#### 4. Mongoose Models (60 min)
Create all 10 models in `xeno-copilot-crm/src/models/`. Build them in dependency order:

```
1. Customer.ts         ← no dependencies
2. Order.ts            ← references Customer
3. ImportJob.ts        ← no dependencies
4. AiLog.ts            ← no dependencies
5. ChannelStats.ts     ← no dependencies
6. Campaign.ts         ← no dependencies (clusters are separate)
7. CampaignCluster.ts  ← references Campaign
8. CampaignMessage.ts  ← references Campaign, Customer, CampaignCluster
9. CommunicationEvent.ts ← references CampaignMessage, Campaign, Customer
10. DispatchJob.ts     ← references Campaign, Customer, CampaignMessage
```

For each model: implement the schema exactly as specified in DATABASE_SCHEMA.md. Add all indexes. Verify the unique indexes (`customers.phone`, `orders.orderId`, `communication_events.idempotencyKey`, `campaign_messages.{customerId, campaignId}`) are created.

**Do not skip indexes.** The Channel Service polls `dispatch_jobs` every 2 seconds — the `{status, createdAt}` index on that collection is load-bearing.

### Afternoon Block (Hours 5–8): Data Pipeline

#### 5. Seed Data Script (90 min)
Create `xeno-copilot-crm/src/scripts/seed.ts`.

The Raga brand demo dataset:
- 1 brand document (brandId stored as env variable `DEMO_BRAND_ID`)
- **1,000 customers** with realistic Indian names, +91 phone numbers, varied RFM profiles
- **3,000 orders** over 120 days with INR amounts (₹500–₹15,000), Raga product categories (Sarees, Kurtis, Lehengas, Dupattas, Accessories)
- **2 prior campaigns** with populated `campaign_clusters`, `campaign_messages`, and `communication_events`
- **Populated `channel_stats`** for WIN_BACK and VIP_LOYALTY campaign types (gives the AI pipeline real benchmark data to compare against)

Customer distribution must map to realistic RFM segments:
- CHAMPIONS: ~12% (120 customers)
- PROMISING: ~18% (180)
- AT_RISK_LOYALISTS: ~10% (100)
- DORMANT_VIPS: ~6% (60)
- LAPSED_LOW_VALUE: ~29% (290)
- GENERAL: ~25% (250)

**Build the seed script before the RFM service.** Running it gives you real data to test against.

#### 6. RFM Service (90 min)
Create `xeno-copilot-crm/src/services/rfm.service.ts`.

The RFM computation follows DATABASE_SCHEMA.md specifications exactly:

**Step 1:** Compute three raw scores per customer:
- `R` = days since `lastOrderAt` (lower = better)
- `F` = `totalOrders`
- `M` = `totalSpend`

**Step 2:** Compute quintile boundaries across all customers using MongoDB aggregation:
```
$percentile over the entire customers collection for R, F, M
```

**Step 3:** Assign scores 1–5 per customer (R score is inverted — lower days = score 5).

**Step 4:** Determine `rfmSegment` using the lookup table from PRD.md §AI Architecture:
- R=4-5, F=4-5, M=4-5 → CHAMPIONS
- R=3-5, F=1-3 → PROMISING
- R=2-3, F=3-5, M=3-5 → AT_RISK_LOYALISTS
- R=1-2, F=4-5, M=4-5 → DORMANT_VIPS
- R=1-2, F=1-3, M=1-2 → LAPSED_LOW_VALUE
- All others → GENERAL

**Step 5:** `bulkWrite` to update all 1,000 customer documents in a single operation.

**Critical:** Full recompute on every invocation. No partial updates. This is architectural — partial updates produce incorrect scores because adding new customers shifts quintile boundaries for everyone.

Test: Run the seed script, then run RFM computation. Verify the segment distribution in Atlas matches the expected ~120 CHAMPIONS, ~60 DORMANT_VIPS.

#### 7. Import Job API (60 min)
Create `xeno-copilot-crm/src/routes/import.routes.ts` and `src/services/import.service.ts`.

Build `POST /import` (multipart/form-data, CSV file + type field) and `GET /import/:jobId`.

The import service:
1. Creates an `ImportJob` document with `status: QUEUED`
2. Parses the CSV using `csv-parse`
3. Upserts customers by phone (prevents duplicates)
4. After completion, triggers RFM recompute
5. Updates `ImportJob` with counts and errors

Test with a small CSV (10 rows) before testing with the full 1,000-row seed file.

#### Day 1 Checkpoint Verification
```
mongosh xeno_copilot --eval "db.customers.countDocuments()"   // → 1000
mongosh xeno_copilot --eval "db.orders.countDocuments()"      // → 3000
mongosh xeno_copilot --eval "db.customers.distinct('rfmSegment')"  // → 6 segments
curl http://localhost:3001/health                              // → { status: "ok" }
```

---

## 4. Day 2 — AI Pipeline

**Theme:** Natural language goal → DRAFT campaign in MongoDB.

**Why this is the highest-risk day:** Gemini API integration always has surprises — JSON mode quirks, token limit edge cases, latency variance. Solve these in isolation before wiring them to the frontend.

### Morning Block (Hours 1–4): Intent Extraction + Audience Query

#### 8. Gemini Client Setup (30 min)
Create `xeno-copilot-crm/src/config/gemini.ts`.

Initialise two client instances:
- `flashClient`: `gemini-1.5-flash` — for Calls 1, 2, 4
- `proClient`: `gemini-1.5-pro` — for Calls 3, 5

Both configured with:
- JSON response mode (`responseMimeType: "application/json"`)
- Timeout wrapper (5s for flash, 10s for pro)
- Retry logic: 1 automatic retry on timeout with exponential backoff

**Test Gemini connectivity before building any feature.** A simple "return the word 'hello' as JSON" call confirms API key, quota, and network connectivity. Do not skip this step.

#### 9. Intent Extraction Service — Call 1 (60 min)
Create `xeno-copilot-crm/src/services/ai/intentExtraction.service.ts`.

Implement:
- System prompt as specified in AI_FEATURES.md §2
- User prompt template with `brandName`, `industry`, `totalCustomers`, `goalText`
- Response schema validation: check `intent_type` against whitelist
- Security check: reject any parameter key starting with `$`
- `AiLog` document created on every call (success and failure)

The intent whitelist lives in `src/config/intentWhitelist.ts` — a hardcoded map from `(intent_type, parameter_keys)` to a MongoDB query builder function. The LLM output feeds into this map; the map constructs the query.

Test with 10 example goal phrases:
- ✓ "Win back customers dormant 90 days"
- ✓ "Reward top 10% of spenders"  
- ✓ "Re-engage one-time buyers"
- ✗ "Send everyone a message" (should return null intent)
- ✗ "{ $where: 'this' }" (injection attempt — should be rejected)

#### 10. Intent Extraction Route (30 min)
Create `POST /campaigns/intent-extract` in `src/routes/campaigns.routes.ts`.

Validate request body (goalText required, 10–500 chars), call the service, return response matching API_SPEC.md §9.1.

#### 11. Audience Query Service (45 min)
Create `xeno-copilot-crm/src/services/audienceQuery.service.ts`.

This service takes `(intent_type, parameters)` and returns a MongoDB filter using the whitelist. It also runs the audience aggregation that feeds into Call 2.

The aggregation produces:
- `count`
- `medianAOV` (approximated as average totalSpend for the cluster)
- `channelMix` (WHATSAPP, EMAIL, SMS counts based on `optOutChannels` exclusion)
- `rfmBreakdown` (count per rfmSegment)
- Cluster definitions (group by rfmSegment, compute per-cluster stats)

Test: run the query for `WIN_BACK_DORMANT` with `dormancyDays: 90`. Confirm it returns the DORMANT_VIPS + LAPSED_LOW_VALUE customers from the seed data.

### Afternoon Block (Hours 5–10): Calls 2, 3, 4

#### 12. Audience Narrative + Persona Service — Call 2 (60 min)
Create `xeno-copilot-crm/src/services/ai/audienceNarrative.service.ts`.

Implements Call 2 from AI_FEATURES.md §3. The service:
1. Takes audience stats from the aggregation
2. Looks up `channel_stats` for historical benchmark selection
3. Falls back to hardcoded cold-start benchmarks if no history exists
4. Calls `gemini-1.5-flash` with the audience context
5. Validates all numbers in the narrative appear in the input context
6. Returns `{ narrative, clusterCards (with persona), revenueEstimate }`

**Validation matters here.** If the LLM invents a statistic (e.g., claims 87% WhatsApp reach when the data says 78%), the narrative is hidden and the raw table is shown instead. This is a 5-minute implementation that prevents a demo-day embarrassment.

#### 13. Message Generation Service — Call 3 (75 min)
Create `xeno-copilot-crm/src/services/ai/messageGeneration.service.ts`.

This is the most complex service. Implements Call 3 from AI_FEATURES.md §5.

Post-generation validation checklist (run after every Call 3):
- `{name}` token present in every message body ✓
- `{ctaUrl}` token present in every message body ✓
- WhatsApp body ≤ 160 characters ✓
- Email subject ≤ 50 characters ✓
- Cluster 1 and Cluster 2 WhatsApp bodies are <85% similar ✓
- No fabricated discount codes (if none was input) ✓

On any validation failure: one automatic retry with the specific constraint added to the prompt. If the retry fails the same check: flag the message for user review but do not block.

**Calls 2 and 3 run in parallel using `Promise.all`.** Do not await Call 2 before starting Call 3.

#### 14. Campaign Audience Preview Route (45 min)
Create `POST /campaigns/:campaignId/audience-preview`.

This route:
1. Creates a Campaign document with `status: DRAFT` (or updates if campaignId exists)
2. Runs the audience query (audienceQuery.service)
3. Kicks off `Promise.all([narrativeService(), messageService()])`
4. Saves CampaignCluster documents for each cluster
5. Saves the `audienceSnapshot` to the Campaign
6. Sets `campaign.draftSavedAt`
7. Returns the full response matching API_SPEC.md §9.2

Test end-to-end: send a goalText, verify Campaign document in Atlas is DRAFT, verify CampaignCluster documents exist, verify narrative and messages are populated.

#### 15. Campaign Critique Service — Call 4 (45 min)
Create `xeno-copilot-crm/src/services/ai/campaignCritique.service.ts`.

Two-layer implementation:
1. Run the 6 deterministic rules (CR-001 through CR-006) in pure Node.js first
2. If all pass: call `gemini-1.5-flash` for tone review
3. Run deterministic rules again on the AI output (regression check)
4. Return diff with `changesApplied` array

Create `POST /campaigns/:campaignId/refine` route.

#### 16. Campaign State Routes (30 min)
Create the remaining campaign lifecycle routes:
- `GET /campaigns` — list with pagination
- `GET /campaigns/:campaignId` — full document
- `DELETE /campaigns/:campaignId` — DRAFT-only delete
- `POST /campaigns/:campaignId/ready` — DRAFT → READY_FOR_REVIEW

#### Day 2 Checkpoint Verification
Run the full pipeline manually via curl or Postman:
```
POST /campaigns/intent-extract          → { intentType, confirmationText }
POST /campaigns/:id/audience-preview    → { narrative, clusterCards, clusters, draftSavedAt }
POST /campaigns/:id/refine              → { critiqueNotes, refinedMessages }
POST /campaigns/:id/ready               → { status: "READY_FOR_REVIEW" }
```
Verify Campaign and CampaignCluster documents in Atlas. Verify AiLog documents for all 4 calls.

---

## 5. Day 3 — Campaign Execution + Frontend Core

**Theme:** Campaigns run. The UI exists. The demo flow is navigable.

**Why frontend starts Day 3:** The backend data layer must be solid before the frontend is built against it. Building UI against a broken API is the fastest way to lose a day to phantom bugs.

### Morning Block (Hours 1–5): Campaign Launch + Channel Service

#### 17. Campaign Launch Service (60 min)
Create `xeno-copilot-crm/src/services/campaign/launch.service.ts`.

The launch service:
1. Validates campaign is `READY_FOR_REVIEW`
2. Loads all CampaignMessage documents for this campaign
3. Creates one `DispatchJob` per customer per channel using `bulkWrite`
4. Transitions campaign to `LAUNCHING`, then `ACTIVE`
5. Returns dispatch job count

Create `POST /campaigns/:campaignId/launch` route matching API_SPEC.md §10.2.

**DispatchJob creation must be atomic-safe.** Use `bulkWrite` with `ordered: false` so a single duplicate key error does not abort the batch. The unique index on `{customerId, campaignId}` on `campaign_messages` prevents true duplicates.

#### 18. Campaign Message Creation (45 min)
Before dispatch jobs can be created, `campaign_messages` must be populated at launch time.

For each customer in the audience:
1. Determine their channel (prefer WHATSAPP if not opted out, else EMAIL)
2. Determine their cluster assignment (based on `rfmSegment`)
3. Create a `CampaignMessage` document with:
   - `messageText` resolved from the cluster's message template
   - `clickTrackingPath`: `/track/click/{messageId}` (write the messageId after insert)
   - `ctaUrl`: denormalized from the cluster for single-lookup redirect

The `clickTrackingPath` and `ctaUrl` denormalization is specified in DATABASE_SCHEMA.md and is load-bearing for the click tracking feature.

#### 19. Channel Service — Poll Loop (60 min)
In `xeno-copilot-channel/src/services/poller.service.ts`:

Implement the 2-second polling loop:
```
Every 2 seconds:
  1. findOneAndUpdate: claim one QUEUED job (status → PROCESSING, attempts++)
  2. If no job: sleep 2 seconds, continue
  3. Route to mock provider based on job.channel
  4. On provider success: POST signed callback to CRM /callbacks/delivery
  5. Update job status: DONE
  6. On provider failure: update job status: FAILED (if attempts >= 3) or QUEUED retry
```

Use `setInterval` not `cron` for the poll loop — sub-second scheduling requires setInterval.

#### 20. Mock Channel Providers (45 min)
Create `xeno-copilot-channel/src/providers/`:
- `mockWhatsapp.provider.ts` — 95% delivery success, 200ms simulated latency
- `mockEmail.provider.ts` (wraps SendGrid for real email) — real email delivery to verified addresses
- `mockSms.provider.ts` — 90% delivery success, 150ms latency

**Use real SendGrid for email.** The demo is more compelling when the evaluator receives an actual email. SendGrid free tier allows 100 emails/day — more than sufficient for a demo with 183 recipients.

For WhatsApp and SMS: realistic mock. The success/failure rates are defined in `src/config/providers.ts` so they can be tweaked for the demo.

#### 21. HMAC Callback Service (45 min)
In the CRM Service, create `POST /callbacks/delivery` matching API_SPEC.md §14.1.

Implementation:
1. Read `X-Xeno-Signature` header
2. Look up `campaign.hmacSecret` by `campaignId` from the payload
3. Recompute HMAC-SHA256 of the raw request body using the secret
4. Compare with `crypto.timingSafeEqual()` — reject on mismatch with 401
5. Compute `idempotencyKey = SHA256("{messageId}:{eventType}")`
6. Insert into `communication_events` — duplicate key error = silent 200 with `accepted: false`
7. Update `campaign_messages.status` and timestamp fields
8. Update `channel_stats` incrementally

#### 22. Click Tracking Route (30 min)
Create `GET /track/click/:messageId` (no auth middleware on this route).

1. Look up `campaign_messages` by `_id` — single document lookup (ctaUrl is denormalized)
2. Record `CLICKED` communication event
3. `302 Found` redirect to `ctaUrl`
4. 404: return HTML fallback (not JSON — this URL is opened in a browser)

### Afternoon Block (Hours 6–11): Frontend

#### 23. Next.js Project Setup (45 min)
Create `xeno-copilot-frontend` with:
- `npx create-next-app@latest` with TypeScript, Tailwind, App Router
- Install ShadCN UI: `npx shadcn@latest init`
- Install components: `button`, `card`, `badge`, `input`, `textarea`, `skeleton`, `dialog`, `toast`, `table`, `progress`
- Create `src/lib/api.ts`: typed fetch wrapper with Bearer token header and error handling
- Create `src/lib/types.ts`: TypeScript interfaces for all API response shapes

**Set `NEXT_PUBLIC_CRM_API_URL` in `.env.local` pointing to localhost:3001 first, then Render URL after deployment.**

#### 24. Layout + Navigation (30 min)
Create `app/layout.tsx` with:
- Sidebar: Xeno Copilot logo, nav links (Dashboard, Customers, Campaigns, Analytics)
- Toast provider
- Global loading state

Keep the sidebar minimal. The evaluator is not grading design — they are grading function.

#### 25. Dashboard Page (45 min)
Create `app/dashboard/page.tsx`.

Use `GET /analytics/dashboard` response to render:
- 4 stat cards: Total Customers, Active Campaigns, Revenue (30d), Avg Conversion Rate
- RFM segment distribution (6 colored badge counters)
- Recent campaigns list (last 3)

This is the landing page. It should load in < 2 seconds with the seed data.

#### 26. Campaign Creation Flow (3 hours — the core feature)
This is the most important frontend work. Build it as a multi-step wizard at `app/campaigns/create/page.tsx`.

**Step 1 — Goal Input**
- Large `<Textarea>` with placeholder: *"Describe your campaign goal in plain English..."*
- 5 goal template buttons below (from PRD.md F-06): 
  - "Win back customers dormant 90+ days"
  - "Reward top 10% of spenders"
  - "Re-engage one-time buyers"
  - "Promote to customers who bought Sarees"
  - "Build loyalty with VIP customers"
- `POST /campaigns/intent-extract` on submit
- Loading state: spinner with "Understanding your goal..."
- Error state: inline error message with retry

**Step 2 — Gate 1: Intent Confirmation**
- Show `confirmationText` from the API response in a highlighted box
- Two buttons: "Yes, that's right" (proceed) / "Let me rephrase" (return to Step 1)
- This step takes < 1 second to render — it's already in the response from Step 1

**Step 3 — Audience Loading (Gate 2 screen)**
- Call `POST /campaigns/:id/audience-preview`
- **Progressive rendering is the key UX moment:**
  - As soon as the response returns (~5s): render the audience narrative and cluster cards
  - Cluster cards include the persona cards with name, behaviour pattern, motivation
  - Message sections show `<Skeleton>` components while the response is loading
  - When full response arrives: skeleton loaders are replaced with the actual messages
- Revenue estimate with benchmark label
- "Approve Audience & Review Messages" button

**Step 4 — Message Review**
- Display WhatsApp and Email messages per cluster in side-by-side cards
- Character count badge on WhatsApp message (red if over 160)
- "Refine with AI" button → opens a `<Dialog>` with a text input for user feedback → calls `POST /campaigns/:id/refine`
- "Looks good" button → calls `POST /campaigns/:id/ready`

**Step 5 — Launch**
- Scheduled send (datetime picker) or Send Now
- Audience count summary
- "Launch Campaign" button → calls `POST /campaigns/:id/launch`
- Success → redirect to `app/campaigns/:id/page.tsx`

#### Day 3 Checkpoint Verification
- Open browser, navigate to `/campaigns/create`
- Type "Win back customers dormant 90 days"
- Complete all 5 steps without errors
- Verify Campaign in Atlas shows `status: ACTIVE`
- Verify DispatchJobs in Atlas are being claimed by Channel Service
- Verify CommunicationEvents are being written

---

## 6. Day 4 — Polish, Deploy, Demo

**Theme:** Make what exists work perfectly. Deploy. Rehearse.

**The rule for Day 4:** No new features. Fix, polish, and rehearse only.

### Morning Block (Hours 1–5): Remaining Pages + Pre-Deployment Fixes

#### 27. Campaign Detail Page (60 min)
Create `app/campaigns/[campaignId]/page.tsx`.

Display:
- Campaign name, status badge, goal text
- Audience snapshot: count, median AOV, channel mix
- Real-time delivery stats from `GET /campaigns/:id/performance`
  - Progress bars: Sent → Delivered → Opened → Clicked → Converted
  - Rates with benchmark comparison (e.g., "69.7% open rate — 7% above WhatsApp benchmark")
- Revenue estimate vs. actual attributed revenue
- "View Messages" tab → paginated `campaign_messages` table

Auto-refresh stats every 10 seconds while campaign is `ACTIVE` (simple `setInterval` on the client).

#### 28. Campaign List Page (30 min)
Create `app/campaigns/page.tsx`.

Simple table: name, status badge, recipients, created date, "View" button. That is all.

#### 29. Customer List Page (30 min)
Create `app/customers/page.tsx`.

Table: name, phone, RFM segment badge, total spend, last order date. Searchable by name/phone. Filter by RFM segment. Clicking a row navigates to `app/customers/[customerId]/page.tsx` (basic detail view).

This page is supporting context for the demo. Do not over-invest here.

#### 30. Segments Page (20 min)
Create `app/segments/page.tsx`.

6 segment cards from `GET /segments`. Each card: segment name, count, avg spend, avg days since order. Clicking a card shows the customer list for that segment.

This is one of the most visually impressive pages to include in a demo because it makes the RFM work visible. Keep it simple.

#### 31. Post-Campaign Report Background Job (45 min)
In `xeno-copilot-crm/src/jobs/reportGeneration.job.ts`:

`node-cron` job running every 30 minutes:
1. Find COMPLETED campaigns where `aiReport` is null and `completedAt < now - 48h`
2. Run communication_events aggregation for full stats
3. Call `gemini-1.5-pro` with the stats block (AI_FEATURES.md §7)
4. Write report to `campaigns.aiReport`

**For the demo:** Override the 48-hour gate with an env variable `REPORT_MIN_HOURS_AFTER_COMPLETION=0` so the two pre-seeded campaigns from Day 1 show populated reports immediately after deployment.

#### 32. Conversion Attribution Job (30 min)
In `xeno-copilot-crm/src/jobs/conversionAttribution.job.ts`:

`node-cron` job running every 30 minutes:
1. Find orders created in the last 14 days where `campaignAttributedTo` is null
2. For each order, check if the customer received a campaign message in the prior 14 days
3. If yes, set `order.campaignAttributedTo` to that campaign (last-touch)
4. Update `campaign_messages.convertedAt` and insert a `CONVERTED` communication event

### Afternoon Block (Hours 6–10): Deployment

#### 33. Environment Variables Audit (30 min)
Before touching Render or Vercel, create a complete `.env.production` checklist for each service:

**xeno-copilot-crm (Render):**
```
MONGODB_URI=<Atlas connection string>
GEMINI_API_KEY=<Gemini API key>
API_SECRET_TOKEN=<random 32-char hex>
CHANNEL_SERVICE_URL=https://xeno-copilot-channel.onrender.com
DEMO_BRAND_ID=<ObjectId from seed>
PORT=3001
NODE_ENV=production
REPORT_MIN_HOURS_AFTER_COMPLETION=0
SENDGRID_API_KEY=<for real email>
```

**xeno-copilot-channel (Render):**
```
MONGODB_URI=<same Atlas connection string>
CRM_SERVICE_URL=https://xeno-copilot-crm.onrender.com
DEMO_BRAND_ID=<same ObjectId>
PORT=3002
NODE_ENV=production
```

**xeno-copilot-frontend (Vercel):**
```
NEXT_PUBLIC_CRM_API_URL=https://xeno-copilot-crm.onrender.com/api/v1
NEXT_PUBLIC_API_SECRET_TOKEN=<same token as CRM service>
```

**Note on token exposure:** `NEXT_PUBLIC_API_SECRET_TOKEN` is visible to the browser. This is acceptable for a demo with no real user data. In production, the API would use a proper auth system. Be ready to explain this tradeoff in the interview.

#### 34. Render Deployment — CRM Service (45 min)
1. Push `xeno-copilot-crm` to GitHub.
2. Create new Web Service on Render.
3. Select repo, set build command: `npm install && npm run build`.
4. Set start command: `npm run start`.
5. Select Starter plan ($7/mo) — eliminates cold starts.
6. Set all environment variables.
7. Deploy. Wait for build.
8. Test: `curl https://xeno-copilot-crm.onrender.com/health`.

#### 35. Render Deployment — Channel Service (30 min)
Same process as above for `xeno-copilot-channel`. The Channel Service's poll loop starts automatically on startup.

Test: monitor Render logs. Within 5 minutes, the poll loop should be running (logging "No jobs in queue" every 2 seconds).

#### 36. Run Seed Script Against Production MongoDB (20 min)
```bash
MONGODB_URI=<atlas_connection_string> npx ts-node src/scripts/seed.ts
```

Verify in Atlas:
- `db.customers.countDocuments()` → 1000
- `db.campaigns.countDocuments()` → 2 (the pre-seeded campaigns with reports)
- `db.channel_stats.countDocuments()` → 4+ documents

#### 37. Vercel Deployment — Frontend (30 min)
1. Push `xeno-copilot-frontend` to GitHub.
2. Import project on Vercel.
3. Set environment variables.
4. Deploy.

After deployment:
- Open the production URL.
- Navigate to Dashboard → should show Raga brand stats.
- Navigate to /campaigns → should show 2 pre-seeded campaigns.
- Navigate to /segments → should show 6 RFM segments.

#### 38. End-to-End Production Smoke Test (30 min)
Run the full campaign creation flow on production:
1. Create a new campaign: "Win back customers dormant 90 days"
2. Complete Gate 1
3. Complete Gate 2 — verify narrative renders, persona cards visible
4. Refine once with feedback: "Make the tone warmer"
5. Launch the campaign
6. Navigate to campaign detail page
7. Watch delivery stats update (Channel Service is live)
8. Verify at least one real email is received (if SendGrid is configured)

If any step fails: fix on production environment, not locally. Time is limited.

### Evening Block (Hours 8–10): Demo Preparation

See §13 for the complete demo preparation plan.

---

## 7. Backend Build Order

Complete ordered list for reference:

```
Phase 1 — Infrastructure
  1.  MongoDB Atlas M0 setup
  2.  CRM Service Express skeleton + health check
  3.  Channel Service Express skeleton + health check
  4.  All 10 Mongoose models + indexes

Phase 2 — Data Pipeline
  5.  Seed data script (1000 customers, 3000 orders, 2 campaigns)
  6.  RFM computation service (full recompute)
  7.  Import job routes + CSV processing service

Phase 3 — Campaign Data Layer
  8.  Audience query service (intent whitelist → MongoDB filter)
  9.  Campaign CRUD routes (list, get, delete)
  10. Campaign state transition routes (ready, launch)

Phase 4 — AI Pipeline
  11. Gemini client setup + connectivity test
  12. Intent extraction service (Call 1) + route
  13. Audience narrative + persona service (Call 2)
  14. Message generation service (Call 3) + parallel execution
  15. Audience preview route (creates DRAFT, runs Calls 2+3 in parallel)
  16. Campaign critique service (Call 4) + route

Phase 5 — Campaign Execution
  17. Campaign message creation service (customer→cluster→message assignment)
  18. Dispatch job bulk creation service
  19. Campaign launch route
  20. Channel Service poll loop
  21. Mock provider implementations (WhatsApp, SMS) + real SendGrid (email)
  22. HMAC callback service + route
  23. Click tracking route

Phase 6 — Background Jobs
  24. Conversion attribution job (node-cron, 30 min)
  25. Post-campaign report job (Call 5, node-cron, 30 min)

Phase 7 — Analytics
  26. Dashboard analytics route
  27. Segment summary route
  28. Channel stats route
  29. Campaign performance route (real-time aggregation from communication_events)
```

---

## 8. Frontend Build Order

```
Phase 1 — Foundation
  1.  Next.js + TypeScript + Tailwind + ShadCN setup
  2.  API client (typed fetch wrapper, Bearer token, error handling)
  3.  TypeScript interfaces for all API response shapes
  4.  Root layout with sidebar navigation
  5.  Toast/notification provider

Phase 2 — Context Pages (build these second; they populate the demo world)
  6.  Dashboard page (stat cards + RFM distribution + recent campaigns)
  7.  Segments page (6 RFM cluster cards)
  8.  Customer list page (searchable table with RFM badge filter)

Phase 3 — Campaign Creation Flow (the product)
  9.  Step 1: Goal input (textarea + 5 template buttons)
  10. Step 2: Gate 1 confirmation (intent text + confirm/rephrase buttons)
  11. Step 3: Audience loading (progressive render — narrative first, skeletons → messages)
  12. Step 4: Message review (cluster cards, per-channel messages, Refine with AI dialog)
  13. Step 5: Launch (schedule + launch button + redirect)

Phase 4 — Campaign Pages
  14. Campaign list page (status-filtered table)
  15. Campaign detail page (delivery stats, progress bars, messages tab)
  16. Campaign AI report section (renders when aiReport is populated)

Phase 5 — Polish
  17. Loading skeletons on all data-fetching pages
  18. Empty states (no customers, no campaigns, no report yet)
  19. Mobile-responsive layout (sidebar collapses)
  20. Error boundaries (API down → friendly message, not crash)
```

---

## 9. AI Integration Order

Build AI features in pipeline order. Do not skip ahead.

```
Step 1: Gemini client + connectivity test
        → Confirm API key, JSON mode, timeout wrapper work before any feature
        → Test: simple "return { test: true }" prompt in JSON mode

Step 2: Call 1 — Intent Extraction
        → Test with 10 goal phrases
        → Verify whitelist rejection works
        → Verify $ injection is caught

Step 3: Intent Whitelist → MongoDB Query Builder
        → This is the security boundary. Test independently of Gemini.
        → Run the 5 query builders against seed data, verify correct customer sets

Step 4: Call 2 — Audience Narrative (in isolation)
        → Pass hardcoded audience stats (no Call 1 needed)
        → Verify numeric consistency check catches invented statistics
        → Verify cold start benchmark is used when channel_stats is empty

Step 5: Call 3 — Message Generation (in isolation)
        → Pass hardcoded cluster data
        → Run full post-generation validation checklist
        → Test auto-retry on WhatsApp length violation

Step 6: Calls 2 + 3 in parallel
        → Wrap in Promise.all
        → Measure actual wall-clock time: should be ~5s (max of 3s, 5s), not ~8s (3s + 5s)

Step 7: Call 4 — Critique
        → Test deterministic layer independently
        → Test AI layer with "Make it warmer" feedback
        → Test regression check (verify AI layer can't remove {name} token)

Step 8: Call 5 — Report (background job)
        → Test against a completed campaign from seed data
        → Override REPORT_MIN_HOURS_AFTER_COMPLETION=0 for demo
        → Verify all benchmark comparisons are correct
```

---

## 10. Deployment Order

**Do not deploy in parallel. Deploy in dependency order.**

```
Step 1: MongoDB Atlas
        → Cluster must exist before either service deploys
        → Run seed script locally against Atlas URI first
        → Verify data in Atlas UI

Step 2: Render — CRM Service
        → Depends on Atlas
        → Verify /health returns ok
        → Verify /segments returns RFM data from seed

Step 3: Render — Channel Service
        → Depends on Atlas + CRM Service (for callback URL)
        → Verify /health returns ok
        → Verify poll loop is running in Render logs

Step 4: Vercel — Frontend
        → Depends on CRM Service URL being known (set NEXT_PUBLIC_CRM_API_URL)
        → Verify dashboard loads with Raga data
        → Run full campaign creation smoke test on production URL

Step 5: Post-deployment validation
        → Create one live campaign from scratch on production
        → Verify delivery stats update within 30 seconds
        → Verify at least one real email arrives
        → Verify click tracking redirect works
        → Verify campaign detail page shows ACTIVE status
```

**Environment Variable Validation Script:**
Before each Render deployment, run through the `.env.production` checklist manually. Missing environment variables are the #1 cause of failed deployments. Render's logs are good but reading them after a failed deploy costs 10 minutes each time.

---

## 11. Critical Path

The critical path is the sequence of work where any delay directly delays the final working demo. Every item below is a hard dependency of the next.

```
MongoDB Atlas setup
    ↓
Mongoose models + indexes
    ↓
Seed data script (1000 customers, 3000 orders)
    ↓
RFM computation service
    ↓
Audience query service (intent whitelist → MongoDB filter)
    ↓
Gemini client + connectivity test
    ↓
Call 1: Intent Extraction service
    ↓
Call 2: Audience Narrative service   ←──── parallel ──── Call 3: Message Generation service
    ↓                                                              ↓
    └──────────────────── audience-preview route ─────────────────┘
                                  ↓
                      Campaign DRAFT in MongoDB
                                  ↓
                     Campaign Message creation
                                  ↓
                     Dispatch Job bulk creation
                                  ↓
                    Channel Service poll loop
                                  ↓
                   HMAC callback → communication_events
                                  ↓
              Campaign detail page (stats updating)
                                  ↓
                    Render deployment (CRM + Channel)
                                  ↓
                     Vercel deployment (Frontend)
                                  ↓
                          DEMO READY
```

**Off-critical-path work** (can be delayed or cut without blocking the demo):
- Import job CSV parsing
- Click tracking
- Conversion attribution background job
- Post-campaign AI report
- Customer list search
- Analytics endpoints
- Mobile responsiveness

---

## 12. Risks and Mitigations

### Risk 1 — Gemini API Latency Spikes
**Probability:** High  
**Impact:** Call 3 (Message Generation) sometimes returns in 3s, sometimes 12s. Demo-day variance is real.

**Mitigation:**
- Implement response caching per `(intentType + parameters + clusterProfile)` hash. Cache in MongoDB with a 24-hour TTL. On demo day, trigger the exact demo campaign 30 minutes before the presentation — the response will be cached.
- Set an 8-second timeout on Call 3. On timeout: return partial response (narrative ready, messages show "Generation timed out — click to retry" button). Do not block the demo.

### Risk 2 — Render Cold Starts
**Probability:** Medium (mitigated by Starter plan)  
**Impact:** First request after inactivity takes 10–20 seconds. If the evaluator opens the app and sees a spinning wheel for 20 seconds, the demo is damaged.

**Mitigation:**
- Use Render Starter ($7/mo) — eliminates cold starts on Render's infrastructure.
- Add a `/health` ping from the frontend's root layout using `useEffect` on mount. This warms the CRM Service as soon as the evaluator opens the page.
- Have the demo URL already open in a browser tab before starting the presentation.

### Risk 3 — MongoDB Atlas M0 Connection Limits
**Probability:** Low  
**Impact:** M0 free tier allows 500 connections. The Channel Service's 2-second poll loop could exhaust connections if Mongoose connection pooling is misconfigured.

**Mitigation:**
- Set Mongoose `maxPoolSize: 5` in both CRM and Channel Service connections.
- M0 allows 500 connections; 2 services × 5 connections = 10 connections. Well within limits.
- Monitor connection count in Atlas dashboard after deployment.

### Risk 4 — HMAC Callback Failures
**Probability:** Medium  
**Impact:** If the Channel Service cannot POST to the CRM Service callback URL, delivery stats will never update. The demo shows 0 delivered even though messages were sent.

**Mitigation:**
- Test callback flow locally with both services running before deployment.
- In the Channel Service, implement 3-retry with exponential backoff on callback POST failures.
- Add a `GET /campaigns/:id/performance` auto-refresh on the frontend (every 10 seconds) so that even delayed callbacks eventually show up.
- Have a fallback: if callbacks are failing during the demo, manually trigger an aggregation query in Atlas to show the evaluator the raw data.

### Risk 5 — Seed Data Quality
**Probability:** Low  
**Impact:** If the seed data RFM distribution is wrong (all customers are GENERAL), the AI narrative will be generic and unimpressive.

**Mitigation:**
- Validate seed data immediately after running the script (Day 1 checkpoint).
- Verify DORMANT_VIP segment has ~60 customers with high avgSpend (₹40,000+).
- The Dormant VIP cluster is the most impressive to show in the demo — it drives the "61 of your highest spenders" narrative.

### Risk 6 — Gemini JSON Mode Inconsistency
**Probability:** Medium  
**Impact:** Gemini 1.5 Flash occasionally returns JSON wrapped in markdown code fences (```json ... ```) despite JSON mode being set. If the JSON parser receives fenced output, it throws and the whole call fails.

**Mitigation:**
- Always wrap Gemini response parsing with a `stripMarkdownFences()` utility that removes ```json and ``` wrappers before passing to `JSON.parse()`.
- This utility is 5 lines of code and prevents an entire class of production failures.

### Risk 7 — Time Overrun on Day 3
**Probability:** High  
**Impact:** Day 3 is the most loaded day. If the frontend campaign creation flow takes longer than estimated, deployment slips to Day 5.

**Mitigation:**
- If the message review step (Step 4) is incomplete by end of Day 3, launch without it. Show the messages in a read-only view and remove the "Refine with AI" option. The core flow still works.
- The frontend cut list (§14) is prioritised for exactly this scenario.

---

## 13. Demo Preparation Plan

### Demo Goal
The evaluator must leave the demo believing:
1. The product works end-to-end.
2. The AI is genuinely useful, not gimmicky.
3. The developer understands production engineering trade-offs.
4. The product is aligned with Xeno's vision.

### Pre-Demo Setup (30 min before presentation)

**Data state to verify:**
- Atlas has 1,000 customers with correct RFM distribution
- 2 pre-seeded campaigns exist: one COMPLETED with AI report, one ACTIVE
- `channel_stats` collection has realistic benchmark data
- No stale PROCESSING dispatch jobs (Channel Service running cleanly)

**Browser tabs to have open:**
1. Dashboard — Raga brand, show RFM distribution
2. Segments page — 6 segment cards visible
3. /campaigns/create — blank, ready for demo
4. One COMPLETED campaign detail — with AI report visible
5. Render logs for Channel Service — shows poll loop activity (impressive to show)
6. MongoDB Atlas — collections view (have this ready, never lead with it)

**Warm the AI:**
30 minutes before the demo, run the exact demo campaign creation flow once. Gemini's response for "Win back customers dormant 90 days" will be in MongoDB cache. The demo response will come back in < 2 seconds instead of 5 seconds.

### Demo Script (12 minutes)

**Minute 0–1: Context setting (30 seconds)**
"Xeno Copilot is a retail CRM where the interface is a goal, not a form. I'll show you what that means."

Open Dashboard. Point to RFM distribution. Say: "This is Raga — an Indian ethnic wear brand. 1,000 customers, 3,000 orders. 61 customers are Dormant VIPs — high spenders who haven't bought in 90+ days. That's the audience we're going to target."

**Minute 1–4: Campaign creation (3 minutes)**
Navigate to /campaigns/create.

Type: "Win back customers who haven't purchased in 90 days"

Point out: "I'm typing a business goal — not configuring a filter, not writing a query."

Call 1 returns: Show the `confirmationText`. Say: "The AI confirms what it understood." Click "Yes, that's right."

Call 2+3 return progressively:
- "The audience narrative appears first — that's 183 customers, including 61 Dormant VIPs."
- "While I was reading that, the messages were generating."
- Point to persona card: "Meet Meera — she represents the Dormant VIP cluster. The AI built a persona from behavioural data, not from assumptions."
- Point to cluster-specific messages: "Two different clusters, two different messages. Dormant VIPs get a warm, personal win-back message. Lapsed customers get a discovery-focused message."

**Minute 4–5: Gate 2 + Launch**
Click "Approve Audience". Say: "Human confirmation before anything is sent — the AI proposes, the marketer decides."

Click "Launch Campaign". Navigate to the campaign detail page.

**Minute 5–8: Live execution (3 minutes)**
Watch stats update. Say: "The Channel Service is dispatching messages to 183 customers right now. WhatsApp to 142, email to 41."

Open Render logs tab: show the Channel Service poll loop claiming and processing jobs.

Show campaign_messages updating in real time (if the frontend auto-refresh is working, the Delivered count will tick up).

Say: "There's no Redis queue, no BullMQ. MongoDB as a job queue with atomic findOneAndUpdate — 99.9% reliable for this volume."

**Minute 8–10: Post-campaign report (2 minutes)**
Navigate to the COMPLETED pre-seeded campaign. Open the AI Report tab.

"This is what the system generates 48 hours after a campaign ends. The Dormant VIP cluster drove 83% of conversions despite being 33% of the audience. The system tells you not just what happened — it tells you what to do next time."

Read the `nextCampaignRecommendation` field aloud.

**Minute 10–12: Technical Q&A prep**
Have these answers ready:
- **"How does the AI query MongoDB?"** — It doesn't. Call 1 extracts `{intent_type, parameters}`. The CRM Service constructs the MongoDB query from a whitelist. The LLM never touches the database.
- **"What happens if Gemini is down?"** — The campaign creation flow degrades gracefully. Audience stats show as a table (no narrative), messages show empty fields with a manual compose option. No step is a hard blocker.
- **"Why MongoDB for the job queue?"** — No Redis dependency (reduces infra complexity for a demo). Atomic `findOneAndUpdate` with status transition is reliable at this volume. If we scaled to 10M messages we'd switch to Redis Streams or BullMQ — that's ADR-007 in the architecture doc.
- **"What's the cost per campaign?"** — ~$0.011 in Gemini API costs. At 1,000 campaigns/month: $11/month total.
- **"Why Render Starter over free tier?"** — $7/month eliminates cold starts. A 20-second cold start during a demo is a demo-killer. That's a professional engineering judgment, not a cost oversight.

### Demo Contingencies

| Problem | During Demo Response |
|---------|---------------------|
| Gemini slow (>8s) | "This is taking a moment — I'll show you the cached result from the campaign I ran earlier." Navigate to ACTIVE campaign. |
| Render cold start | "Let me refresh — the server is waking up." Wait. This should not happen on Starter plan. |
| Delivery stats not updating | "The Channel Service is processing — let me show you the raw data in Render logs." |
| Frontend crashes | Have Postman open with the key API calls pre-configured. Can demo via API responses. |
| MongoDB Atlas down | Seed data is backed up locally. Restore takes 5 minutes. Do not offer this unless asked. |

---

## 14. Cut List — Features Removable Under Time Pressure

Cut from the outside in. Features closer to the top protect the core demo.

### Tier 1 — Never Cut (Demo Breaks Without These)
- Seed data (1,000 customers, 3,000 orders, Raga brand)
- RFM computation + 6 segments
- Campaign creation wizard (all 5 steps)
- AI Calls 1, 2, 3 (intent → narrative → messages)
- Gate 1 and Gate 2 UI
- DRAFT persistence (campaign survives browser refresh)
- Campaign launch (dispatch job creation)
- Channel Service poll loop + mock providers
- HMAC callback + communication_events
- Campaign detail page with live stats
- Render deployment (both services)
- Vercel deployment (frontend)

### Tier 2 — Cut if Day 3 Runs Long
- **Call 4 (Critique):** Remove "Refine with AI" button. Messages are shown read-only. Evaluators rarely ask about critique.
- **Post-campaign AI report (Call 5):** Pre-seed the report for the demo campaign. Remove the background job. The report appears immediately on the detail page from seed data.
- **Conversion attribution job:** Remove. Show "attributed revenue" as a static value from seed data.
- **Email subject + preheader fields:** Show body only for email. Reduces message generation complexity.

### Tier 3 — Cut if Day 4 Morning Runs Long
- **Customer list search:** Show the table without search. 1,000 rows with pagination is still impressive.
- **Import job UI:** CSV import is backend-only. Load seed data via script, not UI.
- **Click tracking redirect:** Remove `/track/click/:messageId`. CTAs still work, just without click attribution.
- **Mobile responsive layout:** Desktop-only for the demo. A CRM is primarily used on desktop.
- **Segments page customer drill-down:** Show segment cards only, no customer list per segment.

### Tier 4 — Cut Without Hesitation
- **Analytics: revenue attribution page** — Raw numbers in the campaign detail page cover this.
- **AI Logs page** — Available via API, not needed in UI for demo.
- **Customer communication history tab** — The campaign messages table covers this.
- **Campaign name editing** — The suggested_name from Call 1 is used as-is.
- **Scheduled send datetime picker** — Remove. All campaigns send immediately.

### The One Feature That Must Not Be Cut

The **pre-campaign revenue estimate** with cold-start benchmark labelling. This is a 20-line addition to the audience preview response that makes the product feel commercially aware. Evaluators notice when a system reasons about revenue. It takes 20 minutes to implement. Do not cut it.

---

## 15. Definition of Done

The project is complete when all of the following are true:

**Backend:**
- [ ] `GET /health` returns `{ status: "ok" }` on both CRM and Channel Service production URLs
- [ ] Seed data: 1,000 customers, 3,000 orders, 6 RFM segments verified in Atlas
- [ ] `POST /campaigns/intent-extract` returns correct intent for all 5 supported goal types
- [ ] `POST /campaigns/:id/audience-preview` creates DRAFT campaign, CampaignCluster documents, aiLog documents
- [ ] `POST /campaigns/:id/launch` creates dispatch jobs equal to `campaign.totalRecipients`
- [ ] Channel Service processes all dispatch jobs to DONE within 60 seconds
- [ ] `POST /callbacks/delivery` correctly validates HMAC and writes communication_events
- [ ] Duplicate callback on same `messageId:eventType` returns `{ accepted: false, reason: "DUPLICATE_EVENT" }` without creating a duplicate event
- [ ] `GET /track/click/:messageId` returns 302 redirect to the correct ctaUrl

**Frontend:**
- [ ] Dashboard loads with Raga brand stats in < 3 seconds
- [ ] Campaign creation wizard completes end-to-end without errors
- [ ] Progressive rendering: narrative appears before messages on Step 3
- [ ] Persona cards visible on cluster cards
- [ ] Campaign detail page shows live-updating delivery stats
- [ ] COMPLETED campaign shows AI report (from seed data)

**Deployment:**
- [ ] Frontend live on Vercel (production URL shareable)
- [ ] CRM Service live on Render Starter (no cold starts)
- [ ] Channel Service live on Render Starter (poll loop running in logs)
- [ ] All environment variables verified (no localhost references in production)
- [ ] End-to-end smoke test on production URLs passes

**Demo:**
- [ ] Demo script runs in 12 minutes without errors
- [ ] Answers prepared for 5 most likely technical questions
- [ ] Contingency responses prepared for 5 most likely failures
- [ ] Render logs tab open in browser before presentation
- [ ] Warm cache run completed 30 minutes before presentation

---

*Document Status: Version 1.0 — Complete. Next: DEPLOYMENT.md*
