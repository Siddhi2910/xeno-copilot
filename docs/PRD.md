# Xeno Copilot — Product Requirements Document

**Version:** 1.1  
**Date:** June 2026  
**Status:** In Review  
**Tagline:** *From Business Goal to Revenue Outcome*

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Product Thesis](#3-product-thesis)
4. [Target User](#4-target-user)
5. [Core User Journey](#5-core-user-journey)
6. [Information Architecture](#6-information-architecture)
7. [Feature Specifications](#7-feature-specifications)
8. [Scope Decisions](#8-scope-decisions)
9. [AI Architecture](#9-ai-architecture)
10. [Channel Service Design](#10-channel-service-design)
11. [Success Metrics](#11-success-metrics)
12. [Constraints and Assumptions](#12-constraints-and-assumptions)
13. [Tradeoffs](#13-tradeoffs)
14. [Prioritization Matrix](#14-prioritization-matrix)
15. [Demo Strategy](#15-demo-strategy)

---

## 1. Executive Summary

Most retail CRM tools ask the marketer to do the hard work — build the segment, write the message, pick the channel, schedule the campaign, then wait and hope.

**Xeno Copilot** inverts this. The marketer states a business goal in plain English. The AI finds the right customers, explains who they are, writes channel-appropriate messages for each behavioral cluster, flags risks before launch, executes the campaign, and delivers a post-campaign report with a recommended next action.

This is not a CRM with an AI chatbot bolted on. It is an AI reasoning layer with a CRM as its operating substrate.

The product answers one question every Xeno client faces on Monday morning:

> "I need more repeat revenue this week. What do I do?"

**V1 scope is intentionally narrow.** This is a proof-of-concept for AI-driven campaign execution, not a feature-complete CRM. Every scope decision serves the core workflow: natural language goal → intelligent campaign → live execution → honest analytics.

---

## 2. Problem Statement

### 2.1 The Marketer's Reality

A retail marketer at a mid-size brand manages:
- 50,000–500,000 customers across multiple touchpoints
- Purchase data spread across a POS, e-commerce platform, and spreadsheets
- A campaign calendar with weekly revenue targets
- 3–5 communication channels with different cost and performance profiles
- No time for data analysis

Existing tools — traditional CRMs, email platforms, SMS gateways — are execution tools. They execute what the marketer tells them to. They do not think.

The marketer spends most of their time not marketing. They spend it:
- Exporting and cleaning data
- Building segment filters ("customers who bought X but not Y in the last 90 days")
- Writing and rewriting copy
- Debating which channel to use
- Waiting for results and guessing what they mean

### 2.2 The Cost of This

- Campaigns launch late because segmentation took too long
- Messages are generic because writing persona-specific variants is impractical at scale
- Channels are chosen by habit, not by what works for each customer segment
- Over-communication erodes trust — unsubscribes, opt-outs, inbox fatigue
- Revenue leaks through dormancy, churn, and missed upsell moments

### 2.3 The Gap Xeno Fills

The data already knows the answer. Purchase history, recency, frequency, and channel behavior already tell you who to contact, what to say, and how to reach them. The gap is not data — it is intelligence applied to data at the speed of a business decision.

Xeno Copilot closes this gap by placing a transparent AI reasoning layer between raw customer data and campaign execution.

---

## 3. Product Thesis

> **"Tell me the business goal. I will execute the campaign."**

Three implications:

**1. The interface is a goal, not a form.**  
The marketer does not build a segment, write a message, or pick a channel. They state an outcome. Everything downstream is AI-generated and AI-explained.

**2. AI decisions must be transparent, editable, and human-gated.**  
The marketer sees *why* the AI made each decision. Every decision can be overridden. Two explicit human approval gates exist — after intent confirmation, and after audience selection — before any message is generated or any campaign is launched. The AI is a co-pilot, not an autopilot.

**3. The loop closes back.**  
A campaign is not a one-way broadcast. After execution, the AI reports what happened, what the data reveals, and what the next action should be.

---

## 4. Target User

### Primary: The Retail Marketer

**Profile:**
- Works at a retail brand (fashion, F&B, beauty, electronics, lifestyle)
- Manages CRM, loyalty, or growth
- Technical comfort: medium — can use spreadsheets, understands concepts like repeat rate and dormancy
- Primary pain: too much time on execution, not enough on strategy

**Jobs to be done:**
- Launch a campaign in under 10 minutes without a data analyst
- Confidently choose who to target and what to say
- Know whether the campaign worked and why

### Secondary: The Brand Owner

Needs one number: "Is my repeat revenue trend improving?" Served by the Audience Health screen. No separate user journey defined for V1.

---

## 5. Core User Journey

### 5.1 The Goal-to-Campaign Flow

The primary flow. Must work flawlessly. Every design decision is evaluated against this.

```
Marketer opens Xeno Copilot
         │
         ▼
[SCREEN 1 — COMMAND BAR]
Types business goal in natural language
"Win back dormant customers"
         │
         ▼
LLM CALL 1: Intent + Audience Plan (single call)
→ Classifies intent: WIN_BACK
→ Extracts parameters: dormancy threshold = 90 days (default)
→ Generates the SQL filter predicate as structured JSON
→ Returns a plain-English confirmation:
  "I'll target customers who haven't bought in 90+ days,
   have made at least 2 prior purchases, and aren't permanently
   opted out. Does this sound right?"

[HUMAN GATE 1 — Intent Confirmation]
Marketer can adjust: dormancy window, minimum orders, exclude segments
One-click confirm or edit inline
         │
         ▼
Audience Discovery (database query — no LLM)
→ Executes filter predicate against customer + order tables
→ Returns: count, recency distribution, LTV distribution, channel distribution
→ If count = 0: surfaces "No customers match this criteria" with suggested
  alternative filters
→ If count < 50: warns "Audience is small — results may not be statistically
  meaningful"
         │
         ▼
[HUMAN GATE 2 — Audience Review]
Marketer sees: matched count, top-10 sample, key stats
Can widen/narrow filters before proceeding
One-click confirm
         │
         ▼
[PROGRESSIVE DISPLAY — results appear as each step completes]

LLM CALL 2: Audience Narrative + Behavioral Clusters (parallel with Call 3)
→ Receives aggregate stats (not raw PII) from audience query
→ Returns: plain-English audience description, 2–3 behavioral cluster
  definitions based on RFM quintile positions

LLM CALL 3: Message Generation per Cluster (parallel with Call 2)
→ Receives: cluster behavioral profiles, campaign goal, brand voice config
→ Returns: structured JSON with one message (subject, body, CTA text) per cluster
→ Each message includes a 1-line rationale: "Written for price-sensitive
  dormant buyers — leads with value offer, not brand story"

[Both displayed simultaneously once both calls return]
Behavioral clusters shown as cards with member count + behavioral summary
Messages shown inline, editable
         │
         ▼
Channel Recommendation (rule-based — no LLM)
→ For each cluster: look up historical open/click rates by channel
→ If no history: apply cold-start defaults (see §9.3)
→ Display recommendation with confidence label:
  "WhatsApp — high confidence (based on 3 prior campaigns)"
  "Email — low confidence (no prior email campaigns — industry default)"
Marketer can override per cluster
         │
         ▼
LLM CALL 4: Pre-Launch Critique (rule-augmented)
→ Applies deterministic rule checks first (see §9.4)
→ LLM call adds contextual risk flags the rules don't cover
→ Returns: structured list of flags (warning / info level)
→ Example: "Cluster B overlaps 340 customers from a campaign sent 4 days ago.
  Consider waiting 3 days to avoid message fatigue."

Revenue Estimate (formula — no LLM, displayed alongside critique)
→ audience_size × campaign_type_conversion_rate × median_AOV
→ Clearly labeled: "Estimated from industry benchmarks" or
  "Based on X prior campaigns for this brand"
→ Range shown: ₹X – ₹Y (±30%)
→ Cold start: explicitly flags "No prior campaign data — using retail industry
  benchmarks (win-back: 4–8% conversion, source: Klaviyo Benchmark Report 2024)"
         │
         ▼
Marketer Reviews Full Campaign Summary
→ Audience, clusters, messages, channels, estimate, flags
→ Can edit: messages (inline), channels (dropdown), schedule (datetime picker)
→ Launch button disabled until marketer has reviewed all flags
         │
         ▼
Campaign Launches
→ Campaign record created with status = DRAFT → LAUNCHED
→ Messages enqueued to Channel Service per customer per channel
→ Marketer lands on Campaign Detail screen
         │
         ▼
[SCREEN 2 — CAMPAIGN DETAIL]
Live delivery funnel updates as callbacks arrive
Sent → Delivered → Opened → Clicked → Converted
         │
         ▼
LLM CALL 5: Post-Campaign Report (triggered at T+48h)
→ Receives: delivery funnel data, per-cluster breakdown, conversion events
→ Returns: narrative summary + recommended next action
→ "Cluster A (high-AOV dormant) converted at 11% — above benchmark.
   Cluster C (one-time buyers) at 1.2% — below benchmark.
   Recommended: retarget Cluster A with a follow-up in 14 days.
   Consider suppressing Cluster C from future win-back campaigns."
```

**Total LLM calls: 5** (down from 9)  
**Parallelized:** Calls 2 and 3 run simultaneously after Human Gate 2  
**Perceived latency:** Intent confirmation appears in ~2s. Audience query is synchronous. Clusters + messages appear together in ~4–6s (parallel calls). Critique appears in ~2s. Total time from goal entry to launch-ready: ~15–20s of AI processing across the full flow, broken into visible progressive steps.

### 5.2 Supporting Flows

**Data Ingestion:**  
CSV or REST API. Required columns are documented. Optional columns mapped by exact name match (no AI column inference — specified columns only). Validation report shows imported / skipped / failed counts with row-level error details.

**Manual Campaign Flow:**  
Rule-based segment builder → select segment → AI generates messages and channel recommendations → same review-and-launch screen. The AI layer is present but the audience is user-defined.

**Campaign Monitoring:**  
Async callbacks from Channel Service update the delivery funnel in real time. Conversion is detected by a background job (not a callback — see §10.3).

---

## 6. Information Architecture

### 6.1 Prioritized Screens

Three screens must be exceptional. Three screens are supporting.

**Core screens (must be polished):**

```
[SCREEN 1] Home / Command Bar
  └── Goal input (large, prominent)
  └── Goal templates: 5 one-click starters
  └── Recent campaigns (last 3, with quick status)
  └── 3 KPIs: Active customers / Repeat rate / Last campaign ROI

[SCREEN 2] Campaign Detail
  └── Live delivery funnel (Sent / Delivered / Opened / Clicked / Converted)
  └── Per-cluster breakdown
  └── Revenue estimate vs. actuals
  └── Post-campaign AI report (appears at T+48h)

[SCREEN 3] Audience Health
  └── Dormancy buckets: Active (0–30d) / At-Risk (31–90d) / Dormant (90d+)
  └── LTV distribution
  └── Churn risk trend (last 90 days)
  └── "1 in 3 of your customers is dormant" — plain English headline
```

**Supporting screens (functional, not polished):**

```
[SCREEN 4] Customers — list, search, import
[SCREEN 5] Campaigns — list with status badges
[SCREEN 6] Settings — brand voice, API keys, import history
```

### 6.2 The Command Bar

The home screen is a goal input, not a dashboard. Goal templates appear below the input as clickable chips:

- "Win back customers dormant 90+ days"
- "Reward top 10% of spenders"
- "Re-engage customers who haven't bought after first purchase"
- "Announce a new collection to active customers"
- "Save customers at risk of churning"

These templates lower the barrier to the first campaign and make the demo reproducible.

---

## 7. Feature Specifications

### Tier 1 — Core (Must Ship)

#### F-01: Customer Ingestion

**CSV Upload:**
- Required columns: `phone` (primary key), `name`, `email` (optional)
- Optional: `created_at`, `city`, `tags`
- Validation: E.164 phone format, email format check, duplicate detection by phone
- Import report: `{total: N, imported: X, skipped_duplicates: Y, failed: Z, errors: [{row, reason}]}`
- Max file size: 10MB (~100K rows)

**API Ingest:**
- `POST /api/v1/customers` — single or batch up to 500 records
- Returns `{job_id, status: "queued"}` for batches > 50
- `GET /api/v1/jobs/{job_id}` — poll for completion

**Storage:** Customer record: `id, name, phone, email, source, tags, created_at, last_order_at (computed), total_orders (computed), total_spend (computed), rfm_r, rfm_f, rfm_m, rfm_segment, opt_out_channels (array)`

**Opt-Out Enforcement:** Customers with a channel in `opt_out_channels` are automatically excluded from dispatch for that channel. No message is ever sent to an opted-out customer. This is non-negotiable — it is a compliance requirement, not a feature.

#### F-02: Order Ingestion

**CSV Upload:**
- Required: `customer_phone`, `order_id`, `amount`, `order_date`
- Optional: `product_category`, `channel` (online/offline), `discount_applied`
- Validation: customer_phone must exist in customer table (warn on orphaned orders, do not fail)
- Returns product category list for filter use in segmentation

**API Ingest:** `POST /api/v1/orders` — batch up to 500. Same job pattern as customers.

**Post-Ingestion:** RFM scores recomputed for all affected customers as a background job after each batch completes. Not synchronous — returns job_id.

**RFM Definition:**
- R (Recency): days since last `order_date` — lower is better
- F (Frequency): count of distinct `order_id` values per customer
- M (Monetary): sum of `amount` per customer
- Scoring: quintile-based 1–5 scale for each dimension. Computed at database level with SQL window functions. No external library required.

#### F-03: AI Goal-to-Campaign Workflow

Specified in §5.1. Key constraints:

**LLM Call Contract:**
- All LLM calls use structured output (JSON schema enforced)
- All calls log: prompt hash, model, latency_ms, input_tokens, output_tokens, response
- Retry: 1 automatic retry on timeout or malformed JSON. After 2 failures: surface error to user with a "Try again" button. Never silently swallow LLM errors.
- Model: Claude claude-sonnet-4-6 (primary). GPT-4o-mini as fallback for lower-latency steps where reasoning depth is less critical.

**Error States:**
| Scenario | System Behavior |
|---|---|
| Intent unclassifiable | Display: "I'm not sure I understood that. Here are 3 goals I can help with: [templates]" |
| Audience = 0 customers | Display: "No customers match these criteria. Try widening the dormancy window or removing the minimum order filter." |
| Audience < 50 customers | Proceed with warning flag: "Small audience — results will not be statistically significant." |
| LLM call fails after retry | Display inline error per step. Allow user to skip the failed step and use a default, or retry. |
| Revenue estimate: no prior campaigns | Use published industry benchmarks, explicitly labeled as such. Never show a number without a source. |

**Brand Voice Configuration:**
- Configured in Settings: tone (warm/professional/playful), brand name, category (fashion/F&B/beauty/other)
- Included in every message generation prompt
- Default if unset: professional, brand name = "Our brand", category = retail

#### F-04: Segmentation Engine

**Rule-Based Filters:** Recency (days since last order), Frequency (number of orders), Monetary (total spend), product category, acquisition source, date range, opt-out status.

**Pre-Built Behavioral Segments:**

| Segment | Definition | Business Meaning |
|---|---|---|
| Active | Last order ≤ 30 days | Engaged — nurture and upsell |
| At-Risk | Last order 31–90 days | Starting to slip — intervene now |
| Dormant | Last order > 90 days | Win-back needed |
| VIP | Top 10% by total_spend | Reward and retain |
| New | First order ≤ 30 days | Onboard and convert to repeat |
| One-Time | Exactly 1 order, > 30 days ago | High-value re-engagement target |

**AI-Generated Segments:** Segments created by the AI workflow are saved with their filter predicates. Reusable. Shown in segment list with "AI Generated" badge.

**Segment Preview:** Audience count, key stats (median AOV, avg frequency, channel mix), sample of 5 records.

#### F-05: Campaign Execution + Channel Service

See §10 for full Channel Service spec.

**Campaign Record:**

```
campaigns:
  id, name, goal_text, goal_type, status
  segment_id, total_recipients
  created_at, scheduled_at, launched_at, completed_at
  
campaign_clusters:
  id, campaign_id, cluster_label, cluster_description
  member_count, assigned_channel, message_subject,
  message_body, message_cta_url

campaign_messages:
  id, campaign_id, cluster_id, customer_id
  channel, recipient (phone/email), status
  sent_at, delivered_at, opened_at, clicked_at, converted_at
  failure_reason
```

**Campaign Status Lifecycle:** `DRAFT → SCHEDULED → LAUNCHING → ACTIVE → COMPLETED → FAILED`

#### F-06: Communication Status Tracking

**Status Funnel:** `Sent → Delivered → Failed → Opened → Clicked → Converted`

> Note: `Read` is only available via WhatsApp Business API (read receipts). Mock provider will simulate it. Real email and SMS do not provide read receipts distinct from opened. The funnel is displayed as-is; unavailable statuses show as `-` rather than 0 to avoid misleading the marketer.

**Status Sources:**
- `Sent`, `Delivered`, `Failed`, `Opened`, `Clicked`: pushed via async callback from Channel Service
- `Clicked`: tracked via redirect URLs (link rewriting in message body — `{{click_track_url}}` replaced with `/track/click/{message_id}` at dispatch time — redirects to CTA URL and records click event)
- `Converted`: computed by a background job that runs every 30 minutes. Matches customers in a campaign who placed a new order within a 14-day attribution window. This is a database query, not a callback. Attribution model: last-touch.

**Opt-Out Detection:** Any delivery callback with status `OPT_OUT` or `UNSUBSCRIBE` immediately adds the channel to the customer's `opt_out_channels`. This prevents future sends without any manual action.

#### F-07: Analytics

**Campaign Analytics (per campaign):**
- Delivery funnel with absolute numbers and percentages at each stage
- Per-cluster breakdown: each behavioral cluster shown separately in funnel
- Revenue: estimated (pre-launch) vs. attributed (post-campaign, from conversion job)
- Cost: estimated by channel × message count (configurable rate per channel in Settings)

**Audience Health (global, always visible):**
- Dormancy distribution: % in Active / At-Risk / Dormant buckets, trended over last 90 days
- Plain-English headline: "38% of your customers haven't purchased in 90+ days"
- LTV distribution histogram
- This screen serves the Brand Owner persona without requiring a separate user journey

**Communication Analytics:**
- Aggregate channel performance across all campaigns: open rate, click rate, conversion rate by channel
- Updated after each campaign completes

**AI Post-Campaign Report:**
- Triggered at T+48h after campaign `completed_at`
- LLM Call 5: funnel data + per-cluster breakdown → narrative summary + next action
- Stored on campaign record. Displayed in Campaign Detail.

#### F-08: Demo Seed Data

A "Load Demo Data" button in Settings seeds the database with:
- 1,000 customers with realistic Indian retail profiles
- 3,000 orders across 120 days (produces meaningful RFM distribution)
- 2 prior completed campaigns with delivery callbacks and conversion events
- Resulting channel performance history (makes channel recommendations non-trivial)
- Pre-populated dormancy distribution: ~30% Active, ~25% At-Risk, ~45% Dormant

This is not optional. Without seed data, the demo opens to empty screens and the AI makes low-confidence recommendations. The demo seed data is the scaffolding that makes every AI feature look impressive.

**The AI should look smart on the seed data.** The seed data is designed so that:
- A "win back dormant customers" query returns 450 customers
- The behavioral clusters are meaningfully different
- Channel history favors WhatsApp for one cluster, email for another
- The post-campaign report for prior campaigns contains a non-trivial insight

#### F-09: Goal Templates

5 clickable goal starters on the home screen. Each pre-populates the command bar with a specific, realistic goal string. Designed to make the first campaign trivially easy to launch.

Doubles as a "guided tour" of the product's capabilities during a demo walkthrough.

---

## 8. Scope Decisions

V1 is deliberately narrow. The following are out of scope and why.

| Out of Scope | Reason |
|---|---|
| Multi-step journey automation | Requires event triggers, wait states, branching logic — a different product category |
| A/B test framework | Requires controlled randomization, sufficient audience size, and meaningful run time. Easy to fake; wrong to fake. |
| Real WhatsApp Business API | Production access requires Meta business verification (days–weeks) and template approval per message. Mocked with identical async contract. |
| RCS channel | Provider availability is limited. Deferred to V2. |
| Multi-tenant / team permissions | Single-brand demo. Architecture supports tenancy via `brand_id` on all tables, but is not activated. |
| Loyalty points engine | Deep brand-specific logic. Not required to demonstrate the AI campaign thesis. |
| Scheduled recurring campaigns | V1 campaigns are launched on-demand or at a single scheduled time. Recurring schedules require a job scheduler and campaign lifecycle management. |
| GDPR / PDPA compliance workflows | Consent management, data deletion requests, export workflows — real requirements for production that are outside V1 scope. Noted as required before any commercial deployment. |

---

## 9. AI Architecture

### 9.1 LLM Usage — Five Calls, Each Justified

| Call | Trigger | Why LLM | Input | Output |
|---|---|---|---|---|
| 1 | Goal submitted | Intent classification + SQL predicate generation — structured reasoning over ambiguous text | Goal text + schema summary | `{intent_type, filters: [{field, op, value}], confirmation_text}` |
| 2 | Audience confirmed | Narrative generation — converting aggregate stats to human language | Audience stats JSON | Plain-English audience description + cluster definitions |
| 3 | Audience confirmed (parallel with 2) | Message generation — persona-aware copywriting at quality a marketer would accept | Cluster profiles + brand voice + goal | `{clusters: [{label, description, message: {subject, body, cta_text, rationale}}]}` |
| 4 | Post-audience, pre-launch | Contextual risk flagging — catches campaign risks that rules don't cover | Campaign summary + critique rule outputs | `{flags: [{level, message, suggestion}]}` |
| 5 | T+48h post-campaign | Post-campaign narrative — converting funnel data to actionable insight | Funnel data + per-cluster breakdown | Narrative report + next action recommendation |

**No LLM used for:** audience querying (SQL), clustering (RFM rules), channel recommendation (lookup table), revenue estimation (formula), delivery tracking (webhooks), conversion attribution (SQL job).

### 9.2 Audience Clustering — Rule-Based RFM

K-means is removed. Rationale: unstable on small datasets, adds a dependency, produces clusters that require post-hoc labeling anyway, and is not interpretable to a marketer.

**Approach: RFM quintile binning**

Each customer has R, F, M scores on a 1–5 scale (quintiles). Cluster assignment uses a lookup table:

| RFM Pattern | Cluster Label | Behavioral Description |
|---|---|---|
| R=4–5, F=4–5, M=4–5 | Champions | Recent, frequent, high-value. Reward them. |
| R=4–5, F=2–3, M=3–5 | Promising | Recent but not yet loyal. Develop them. |
| R=3–4, F=3–5, M=3–5 | At-Risk Loyalists | Were loyal, starting to slip. Intervene now. |
| R=1–2, F=3–5, M=3–5 | Dormant VIPs | Were high-value, gone quiet. Win back urgently. |
| R=1–2, F=1–2, M=1–2 | Lapsed Low-Value | Dormant, low spend. Low-cost channel only. |
| All others | General | Catch-all. Treat as At-Risk. |

The LLM receives these cluster labels and the aggregate stats per cluster. It narrates them in plain English — it does not invent the clusters. The segmentation logic is deterministic and auditable.

### 9.3 Cold Start Handling

When no prior campaign data exists for a brand, every AI decision that normally relies on historical performance falls back to published industry benchmarks. These benchmarks are hardcoded in the application and clearly labeled in the UI.

| Recommendation | Cold Start Default | Source Label |
|---|---|---|
| Channel recommendation | WhatsApp first (if opt-in list available), else Email | "Industry default — no prior campaigns" |
| Win-back conversion rate | 5% | "Klaviyo Retail Benchmark 2024" |
| Promotional conversion rate | 8% | "Klaviyo Retail Benchmark 2024" |
| VIP reward conversion rate | 15% | "Klaviyo Retail Benchmark 2024" |
| WhatsApp open rate | 65% | "Gupshup Retail Benchmark 2024" |
| Email open rate | 22% | "Mailchimp Retail Benchmark 2024" |
| SMS open rate | 35% | "Twilio Retail Benchmark 2024" |

Every estimate generated from these benchmarks is labeled "Estimated from industry benchmarks" in the UI. The product never presents a number without a source. Cold start is visible to the marketer — not hidden.

As campaigns complete, actual performance data replaces benchmarks. The system explicitly tells the marketer when this happens: "Channel recommendation updated based on your first 3 campaigns."

### 9.4 Campaign Critique — Rule-Based Checks

Critique consists of deterministic rule checks executed against the campaign data, supplemented by a single LLM call for contextual flags the rules miss.

**Deterministic Rules (always run, no LLM):**

| Rule | Trigger | Flag Level | Message |
|---|---|---|---|
| Small audience | count < 50 | Warning | "Audience is very small. Results will not be statistically significant." |
| Recent overlap | >20% of audience received a campaign in the last 7 days | Warning | "340 customers in this audience were contacted 4 days ago. Consider waiting to reduce fatigue." |
| Discount to VIP | Campaign contains "% off" or "discount" + any cluster contains Champions | Info | "VIP customers typically respond better to exclusivity messaging than discount offers." |
| No CTA | message_cta_url is empty | Warning | "Messages without a link have significantly lower conversion rates." |
| Missing opt-out check | opt_out_channels not filtered | Error | "Some recipients have opted out of this channel. Review before sending." (Should never appear if ingestion is working — this is a safety net.) |
| Empty cluster | Any cluster has 0 members | Warning | "One behavioral cluster has no members. It will be skipped." |

**LLM contextual check (Call 4):** Receives the full campaign summary and rule-check outputs. Adds 1–3 additional contextual flags not covered by rules. Capped at 3 flags to avoid alert fatigue.

### 9.5 Prompt Versioning and Observability

- All prompts are stored in a `/prompts` directory, version-controlled
- Each LLM call writes a log entry: `{call_type, model, prompt_hash, latency_ms, input_tokens, output_tokens, success, error}`
- Prompt logs are queryable — this enables: "Why did this campaign get these messages?" forensics
- Estimated LLM cost per full campaign generation: ~$0.03–0.08 (Claude claude-sonnet-4-6 pricing). Acceptable for a demo product.

---

## 10. Channel Service Design

### 10.1 Why a Separate Service

The Channel Service is a separately deployable service — required by the assignment specification. The architectural rationale:

1. **Fault isolation:** Provider failures do not degrade the CRM API
2. **Scalability:** Dispatch is I/O bound — scales horizontally independent of CRM
3. **Provider abstraction:** Swapping WhatsApp mock for a real provider changes one adapter file, not the CRM

### 10.2 Transport and Queue

CRM → Channel Service communication uses a **database-backed job queue** (not Redis/BullMQ). Rationale: Redis + BullMQ adds infrastructure complexity and a deployment dependency. A `dispatch_jobs` table with status polling achieves the same properties for a demo-scale product:

```
dispatch_jobs:
  id, campaign_id, message_id, customer_id
  channel, recipient, message_json, callback_url
  status (queued/processing/sent/failed)
  attempts, last_attempted_at, error
  created_at
```

The Channel Service polls this table every 2 seconds (or uses `pg_notify` for push). This approach:
- Requires no additional infrastructure
- Survives CRM or Channel Service restarts
- Provides a natural dead-letter mechanism (status = failed, attempts ≥ 3)
- Is auditable via SQL

If Redis is available in the deployment environment, BullMQ can replace the polling loop with zero changes to the contract. This is a deployment choice, not an architecture change.

### 10.3 Service Contract

**CRM → Channel Service (Dispatch Job, via queue table):**
```json
{
  "message_id": "uuid",
  "campaign_id": "uuid",
  "customer_id": "uuid",
  "channel": "whatsapp | email | sms",
  "recipient": "+919876543210 or email@domain.com",
  "message": {
    "subject": "string (email only)",
    "body": "string",
    "cta_url": "string"
  },
  "callback_url": "https://crm-api/api/v1/campaigns/{id}/callbacks",
  "callback_hmac_secret": "per-campaign HMAC secret"
}
```

**Channel Service → CRM (Async Callback):**
```json
{
  "message_id": "uuid",
  "customer_id": "uuid",
  "channel": "string",
  "status": "sent | delivered | failed | opened | clicked | opt_out",
  "timestamp": "ISO 8601",
  "signature": "HMAC-SHA256 of payload using callback_hmac_secret"
}
```

**Callback Security:** The CRM validates the HMAC signature on every inbound callback. Callbacks with invalid signatures are rejected with 401. This prevents spoofed delivery confirmations. Each campaign gets a unique HMAC secret generated at launch time.

### 10.4 Channel Implementations

| Channel | Provider | Sent | Delivered | Opened | Clicked |
|---|---|---|---|---|---|
| Email | SendGrid | Real | Real (webhook) | Real (open pixel) | Real (click tracking) |
| WhatsApp | Mock | Simulated | Simulated (5–30s delay) | Simulated (30s–3min delay) | Simulated |
| SMS | Mock | Simulated | Simulated (2–15s delay) | N/A | N/A |

**Conversion (all channels):** Background job in CRM, runs every 30 minutes. Queries: customers with an active campaign attribution window who have a new order with `order_date` > `campaign sent_at`. Last-touch, 14-day window.

**Mock Simulation:** The mock providers do not fire callbacks instantly. They use a delay distribution that mimics real-world patterns. This makes the live demo status funnel feel authentic.

### 10.5 Build Time Acknowledgment

Realistic build time for the Channel Service: **1 full day**. Includes: HTTP server setup, queue polling loop, per-channel adapter (email real, WhatsApp mock, SMS mock), callback dispatch with HMAC signing, retry logic (max 3 attempts), failed job logging, and independent deployment. The earlier estimate of 0.5 days was optimistic.

---

## 11. Success Metrics

### 11.1 Demo-Time Metrics (What Must Work)

| Requirement | Standard |
|---|---|
| Goal → launch-ready campaign | Under 60 seconds of user interaction (AI processing time excluded) |
| All 5 LLM calls return valid structured output | 100% on seed data |
| Delivery funnel updates live | Callbacks arrive within 60s of launch for mock channels |
| Conversion events detected | Background job attributes conversions within seed data |
| Post-campaign report generated | Appears at T+48h (simulate in demo by setting campaign created_at -48h) |
| Cold start defaults shown, labeled | Visible on first launch before any campaigns |

### 11.2 Business Metrics (If This Were Real)

- Campaign creation time: target 80% reduction vs. manual baseline
- Personalization rate: % of campaigns with cluster-specific messages — target 100%
- Marketer activation: % of new users who launch a campaign in session 1 — target >60%
- Campaign conversion lift: AI-generated vs. manually built — target +15%

---

## 12. Constraints and Assumptions

### Technical

- **Build time:** 3–4 days. Features that cannot be built well in the time available are deferred, not simplified.
- **LLM latency:** 2–5s per call at Claude claude-sonnet-4-6 / GPT-4o speeds. Calls 2 and 3 run in parallel. Progressive display prevents a blank loading state.
- **Database:** PostgreSQL. RFM scores are stored on customer records and refreshed by a post-ingestion background job — not recalculated per query.
- **Channel Service:** Separate deployment. Database-backed queue. No Redis dependency.
- **Deployment:** CRM backend on Railway or Render, Channel Service on Railway or Render (separate service), Frontend on Vercel or Netlify. All three URLs are live.

### Product Assumptions

- **Single brand / tenant.** `brand_id` column exists on all tables but multi-tenancy is not activated.
- **Conversion attribution** is last-touch, 14-day window. Real attribution is multi-touch and more complex. This is documented in the UI.
- **"Read" status** is only available via WhatsApp Business API read receipts. Simulated in mock. Shown as `-` for email and SMS rather than 0.
- **Order data is imported manually** (CSV or API). Real-time POS integration is not V1. Conversion tracking depends on orders being ingested post-campaign.
- **Opt-out is channel-specific.** Opting out of WhatsApp does not opt out of email.
- **No real-time data.** RFM scores update after ingestion events, not continuously.

---

## 13. Tradeoffs

### 13.1 9 LLM Calls → 5 LLM Calls

**Decision:** Consolidate intent + SQL generation into one call. Run audience narrative + message generation in parallel. Move revenue prediction out of LLM entirely (formula). Move channel recommendation out of LLM (lookup table with cold-start defaults).

**Why:** 9 sequential calls produces 15–60 seconds of total AI wait time with 9 failure points. 5 calls (2 parallel) produces 10–20 seconds of perceived wait time across 3 stages. The removed calls were not delivering LLM-specific value — they were doing arithmetic or table lookups.

### 13.2 Human Gates in the AI Flow

**Decision:** Two explicit human approval points — intent confirmation and audience review — before any message is generated or campaign is launched.

**Why:** An AI that runs from goal to launch without a human checkpoint is an autopilot, not a copilot. It will make mistakes. A marketer who cannot see and approve who they're about to send 10,000 messages to will not trust the product after the first error. The gates add 30 seconds of interaction time and prevent the single most damaging failure mode: wrong audience, mass send.

### 13.3 Rule-Based Clustering Over K-Means

**Decision:** RFM quintile binning with a fixed lookup table. No k-means.

**Why:** K-means is unstable on small datasets, requires choosing k, produces clusters that need post-hoc labeling, and adds a dependency. RFM quintile binning produces identical business-relevant segments, is fully interpretable, is implemented in SQL, and has been the industry standard for retail customer segmentation for 30 years. The LLM narrates these clusters — it does not invent them.

### 13.4 Database-Backed Queue Over Redis + BullMQ

**Decision:** `dispatch_jobs` table with polling or pg_notify for the Channel Service queue.

**Why:** Redis + BullMQ adds an infrastructure dependency, complicates deployment, and solves a scale problem that doesn't exist at demo scale. A database-backed queue is fully auditable, survives restarts, and can be swapped for Redis without changing the Channel Service contract. This is the correct choice for a 3-day build that needs to deploy reliably.

### 13.5 Honest Revenue Estimation Over Impressive-Looking ML

**Decision:** Formula-based estimate with explicit source citation. No model.

**Why:** There is no dataset to train a model on. Any "ML prediction" would be either a regression on 5 data points or a confidence trick. A transparent formula with published industry benchmarks as the cold-start default is more credible to an experienced evaluator than a black-box percentage. The ±30% confidence interval is visible and honest. This shows data literacy — not statistical naivety.

---

## 14. Prioritization Matrix

| Feature | Business Value | Build Risk | Time (days) | Priority |
|---|---|---|---|---|
| Customer + Order Ingestion | High | Low | 0.5 | P0 |
| RFM Computation + Segments | High | Low | 0.25 | P0 |
| AI Goal → Campaign (5 calls) | Very High | Medium | 1.5 | P0 |
| Demo Seed Data | Critical | Low | 0.25 | P0 |
| Channel Service (separate) | High | Medium | 1.0 | P0 |
| Delivery Status Tracking + Callbacks | High | Medium | 0.5 | P0 |
| Conversion Background Job | High | Low | 0.25 | P0 |
| Campaign Analytics + AI Report | High | Low | 0.5 | P0 |
| Audience Health Dashboard | High | Low | 0.25 | P0 |
| Goal Templates | Medium | Low | 0.1 | P0 |
| Manual Segment + Campaign Flow | Medium | Low | 0.5 | P1 |
| Smart Send Time | Low | Low | 0.25 | P2 |
| Campaign Comparison | Low | Low | 0.25 | P2 |
| K-means Clustering | Low | Medium | 0.5 | Removed |
| Real WhatsApp API | Low | Very High | 2.0+ | Removed |
| A/B Test Framework | Medium | High | 1.5 | Removed |
| Redis + BullMQ (in place of DB queue) | Low | Medium | 0.5 | Removed |

**Total P0 estimated time:** ~4.85 days  
**Realistic P0 achievable in 3–4 days:** Yes — ingestion and RFM are fast. Channel Service is the riskiest single item. AI workflow is the highest-value item and should not be cut.

---

## 15. Demo Strategy

The walkthrough video is a product. It should be scripted as carefully as the code.

### 15.1 First 60 Seconds

1. Open the product. The command bar is front and center. No tutorial, no onboarding modal.
2. Show the Audience Health screen. Headline: "45% of your customers haven't purchased in 90+ days." This is the problem statement made real.
3. Return to the command bar. Type: "Win back dormant customers."
4. Show AI intent confirmation: the system repeats back what it understood and asks for confirmation. This builds trust.
5. Confirm. Audience query runs. "I found 450 customers dormant for 90+ days."

### 15.2 The WOW Moments

There are three moments the evaluator should remember:

**WOW 1 — The AI is transparent about its reasoning.**  
When behavioral clusters appear, each cluster shows not just its members but *why* they were grouped: "This group of 180 customers last bought during a sale period, had a high AOV but low frequency, and stopped purchasing when discount cadence reduced. They are price-responsive but not brand-loyal."

**WOW 2 — The critique catches something real.**  
Before launch, the critique flags: "200 customers in this audience also received last week's campaign. Consider excluding them to avoid fatigue." The marketer clicks "Exclude" and the audience updates. The AI caught a mistake before it happened.

**WOW 3 — The post-campaign report is a next action, not a summary.**  
"Cluster A (Dormant VIPs) converted at 12% — 3x the benchmark. Cluster C (Lapsed low-value) converted at 0.8% — below cost. Recommendation: Suppress Cluster C from future win-back campaigns. Schedule a follow-up for Cluster A non-converters in 14 days."

### 15.3 Seed Data Narrative

The demo seed data is designed around a fictional fashion retailer: **"Raga"** (Indian ethnic wear, mid-premium).

- 1,000 customers across 6 Indian cities
- 3,000 orders over 120 days, with festive season peak visible in the data
- 2 prior campaigns: one WhatsApp (high open rate), one email (lower open rate) — creates clear channel preference in the data
- 450 dormant customers who lapsed after the festive season — the "win back" campaign targets this exact cohort
- 85 VIP customers (top 10% by spend) who are still active — available for a "Reward your best customers" demo

This narrative makes the AI recommendations contextually compelling. "WhatsApp outperformed email for this audience in previous campaigns" feels true because the seed data makes it true.

### 15.4 What to Anticipate From Evaluators

| Likely Question | Prepared Answer |
|---|---|
| "How does this differ from what Xeno already does?" | "Xeno today requires marketers to build campaigns manually. Copilot inverts the interface — the marketer states a goal, the AI executes. It's the difference between a tool and a co-worker." |
| "What if the AI generates a wrong segment?" | "Human Gate 1 and Gate 2. The marketer confirms intent before audience is queried, and confirms the audience before any message is generated. The AI cannot send a single message the marketer hasn't reviewed." |
| "How does revenue prediction work?" | "Transparent formula: audience size × conversion rate × median AOV. Cold-start uses published industry benchmarks, explicitly labeled. As campaigns complete, actual performance replaces benchmarks." |
| "Why mock WhatsApp instead of real?" | "Meta's WhatsApp Business API requires business verification and template approval — a process that takes days to weeks. The Channel Service is architecturally identical to what a production integration would look like. The mock uses the same async callback contract; only the transport layer changes." |
| "How would this scale to 1 million customers?" | "RFM scores are stored, not computed on read. Audience queries are indexed SQL. The AI pipeline is stateless and horizontally scalable. The Channel Service scales independently of the CRM. The database-backed queue is replaceable with Redis + BullMQ without changing the contract." |

---

*Document Status: Version 1.1 — Updated following triple-lens review. Awaiting approval before proceeding to SYSTEM_ARCHITECTURE.md.*
