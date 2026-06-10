# AI Features

**Version:** 1.0  
**Product Thesis:** Tell me the business goal. I will execute the campaign.  
**AI Stack:** Google Gemini 1.5 Flash (speed) + Gemini 1.5 Pro (quality)  
**Pipeline:** 5 sequential/parallel Gemini calls across the campaign lifecycle

---

## Table of Contents

1. [Pipeline Overview](#1-pipeline-overview)
2. [Feature 1 — Goal to Audience (Intent Extraction)](#2-feature-1--goal-to-audience-intent-extraction)
3. [Feature 2 — Audience Explanation (Narrative Generation)](#3-feature-2--audience-explanation-narrative-generation)
4. [Feature 3 — Customer Persona Generation](#4-feature-3--customer-persona-generation)
5. [Feature 4 — Message Generation](#5-feature-4--message-generation)
6. [Feature 5 — Campaign Critique](#6-feature-5--campaign-critique)
7. [Feature 6 — Performance Analysis (Post-Campaign Report)](#7-feature-6--performance-analysis-post-campaign-report)
8. [Shared Design Principles](#8-shared-design-principles)
9. [Cost Model](#9-cost-model)
10. [Cold Start Handling](#10-cold-start-handling)
11. [Failure Handling Matrix](#11-failure-handling-matrix)

---

## 1. Pipeline Overview

The AI system is a **5-call Gemini pipeline** that accompanies the full campaign lifecycle — from the moment a user types a goal to the report generated 48 hours after a campaign ends.

```
User types goal
      │
      ▼
┌─────────────────────────────────────────────────────┐
│  CALL 1 — Intent Extraction           gemini-1.5-flash │
│  "Win back dormant customers"                         │
│  → { intent_type, parameters, confirmation_text }     │
└──────────────────────┬──────────────────────────────┘
                       │
              [GATE 1: User confirms intent]
                       │
          ┌────────────┴────────────┐
          │                         │
          ▼                         ▼
┌─────────────────────┐   ┌─────────────────────────────┐
│  CALL 2             │   │  CALL 3                      │
│  Audience Narrative │   │  Message Generation          │
│  gemini-1.5-flash   │   │  gemini-1.5-pro              │
│  ~3s                │   │  ~5s                         │
└─────────────────────┘   └─────────────────────────────┘
          │                         │
          └────────────┬────────────┘
                       │
              [GATE 2: User reviews audience]
              Campaign saved as DRAFT
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│  CALL 4 — Campaign Critique           gemini-1.5-flash │
│  Deterministic rules + AI tone review                 │
│  → { issues[], refinedMessages[], critiqueNotes }     │
└──────────────────────┬──────────────────────────────┘
                       │
              Campaign launched
                       │
              T + 48 hours
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│  CALL 5 — Post-Campaign Report        gemini-1.5-pro  │
│  Async background job                                 │
│  → { summary, insights, recommendations }             │
└─────────────────────────────────────────────────────┘
```

**Why this structure works:**
- Calls 2 and 3 run in parallel — total wait is max(2s, 5s) not 2s + 5s.
- Call 2 renders immediately in the UI while Call 3 completes behind skeleton loaders.
- No LLM call is made at launch time — dispatch is purely mechanical.
- Call 5 is async and never blocks the user.

---

## 2. Feature 1 — Goal to Audience (Intent Extraction)

### Problem

Retail marketers know their business goals but not how to translate them into database queries. "Win back customers who haven't bought in 90 days" requires knowledge of RFM scoring, segment definitions, and MongoDB filter syntax. Most CRM tools require marketers to learn the tool's query builder — a significant adoption barrier.

Traditional CRMs make this a manual, multi-step process: choose segment type → set filters → preview count → adjust → repeat. A marketer who simply wants to re-engage dormant customers has to understand the tool's data model before they can execute.

### User Value

The user types a sentence. The system converts it into a precise audience definition, shows the plain-English interpretation back to them for confirmation, and proceeds only after they agree. No segment builders. No filter dropdowns. No SQL.

**Concrete UX:** User types *"Reward my top spenders from the last 6 months"* → system responds *"I'll target customers in the top 10% by spend who made at least one purchase in the last 180 days — that's your Champions and high-Promising customers. Does that sound right?"*

### Business Value

- Reduces campaign creation time from ~15 minutes (manual CRM filter building) to ~60 seconds.
- Lowers the skill floor — a store manager can create a campaign, not just a CRM analyst.
- Directly aligned with Xeno's commercial thesis: AI-native CRM that works the way marketers think.

### Inputs

| Input | Source | Format |
|-------|--------|--------|
| `goalText` | User | Natural language string, 10–500 chars |
| `availableIntents` | CRM Service | Hardcoded whitelist of supported intents |
| `brandContext` | CRM Service | Brand name, industry, total customers |

### Outputs

```json
{
  "intent_type": "WIN_BACK_DORMANT",
  "parameters": {
    "dormancyDays": 90
  },
  "confirmation_text": "I'll target customers who haven't purchased in the last 90 days. This typically includes your Dormant VIP and Lapsed Low-Value segments. Does this match what you had in mind?",
  "suggested_name": "Win-Back Campaign — 90 Day Dormant"
}
```

**Critical constraint:** The LLM outputs `intent_type` and `parameters` only. It never generates MongoDB operators, filter objects, or query syntax. The CRM Service owns a hardcoded whitelist that maps `(intent_type, parameters)` → MongoDB query. This is the security boundary.

### Intent Whitelist

| `intent_type` | Required Parameters | MongoDB Query Constructed by CRM |
|---|---|---|
| `WIN_BACK_DORMANT` | `dormancyDays: number` | `{ lastOrderAt: { $lt: now - dormancyDays }, rfmSegment: { $in: ["DORMANT_VIPS", "LAPSED_LOW_VALUE"] } }` |
| `REWARD_TOP_SPENDERS` | `topPercentile: number` | `{ rfmM: 5, rfmF: { $gte: 3 } }` (top quintile) |
| `RE_ENGAGE_SINGLE_PURCHASE` | *(none)* | `{ totalOrders: 1, lastOrderAt: { $lt: 60daysAgo } }` |
| `UPSELL_CATEGORY` | `category: string` | `{ "recentCategories": category, rfmSegment: { $in: ["CHAMPIONS", "PROMISING"] } }` |
| `VIP_LOYALTY` | `minOrderCount`, `minTotalSpend` | `{ totalOrders: { $gte: minOrderCount }, totalSpend: { $gte: minTotalSpend } }` |

If the LLM returns an `intent_type` not in this whitelist, the CRM Service returns a 422 error. The user is prompted to rephrase.

### Prompt Design

**System Prompt:**

```
You are a CRM intent classifier for a retail brand called {brandName}.

Your ONLY job is to classify the marketer's goal into one of these supported intents:
- WIN_BACK_DORMANT: Reach customers who haven't purchased recently
- REWARD_TOP_SPENDERS: Target high-value customers by spend
- RE_ENGAGE_SINGLE_PURCHASE: Reach customers who bought once and never returned
- UPSELL_CATEGORY: Promote a product category to relevant buyers
- VIP_LOYALTY: Reward long-term loyal customers

Rules:
1. Output ONLY valid JSON matching the schema below.
2. Never generate MongoDB queries, filters, or operators.
3. Never invent intent types not in the list above.
4. If the goal is ambiguous or matches no intent, set intent_type to null and explain in confirmation_text.
5. Extract numeric parameters exactly as stated (e.g., "90 days" → dormancyDays: 90).
6. Write confirmation_text in plain English, under 60 words, from the system's perspective.

Output schema:
{
  "intent_type": string | null,
  "parameters": object,
  "confirmation_text": string,
  "suggested_name": string
}
```

**User Prompt:**

```
Brand: {brandName} ({industry})
Total customers: {totalCustomers}

Marketer's goal: "{goalText}"

Classify and confirm.
```

**Example exchange:**

Input: `"Reward my top 10% of spenders"`  
Output:
```json
{
  "intent_type": "REWARD_TOP_SPENDERS",
  "parameters": { "topPercentile": 10 },
  "confirmation_text": "I'll target your top 10% of customers by lifetime spend — your Champions and highest-value Promising customers. These are typically your most engaged buyers. Does this match your goal?",
  "suggested_name": "VIP Rewards — Top 10% Spenders"
}
```

Input: `"Send everyone a message"`  
Output:
```json
{
  "intent_type": null,
  "parameters": {},
  "confirmation_text": "I couldn't identify a specific targeting goal here. Could you be more specific — for example, 'win back customers who haven't purchased in 90 days' or 'reward top spenders'?",
  "suggested_name": null
}
```

### Gemini Usage

| Parameter | Value |
|-----------|-------|
| Model | `gemini-1.5-flash` |
| Rationale | Classification task. Speed matters more than depth. Flash returns in ~1s. |
| Temperature | `0.1` |
| Max output tokens | `256` |
| Response format | JSON mode (`application/json`) |
| Estimated latency | 800ms–1.5s |

Temperature is near-zero because this is a classification task with a closed output space. Higher temperature risks hallucinated intent types.

### Failure Handling

| Failure Mode | Detection | Response |
|---|---|---|
| Gemini API timeout (>5s) | Timeout guard | Return 502 with `retryAfterMs: 3000` |
| LLM returns unknown intent_type | Whitelist check in CRM Service | Return 422, prompt user to rephrase |
| LLM returns malformed JSON | JSON parse error | Retry once with temperature 0. If still fails, return 502 |
| LLM returns `intent_type: null` | Null check | Return 200 with `confirmationText` asking for clarification. Do not proceed to Call 2 |
| LLM injects MongoDB operators | Validation: reject any key starting with `$` in parameters | Return 422, log security alert |

### Cost Estimate

- Input: ~300 tokens (system + user prompt)
- Output: ~100 tokens
- Total: ~400 tokens per call
- Cost at Gemini 1.5 Flash pricing ($0.075/1M input, $0.30/1M output): < $0.0001 per call
- At 1,000 campaigns/month: < $0.10/month

### Why Evaluators Will Care

This is the most visible AI feature in the product. In a 5-minute demo, the evaluator sees the user type one sentence and watch the system produce a precise, confirmed audience definition in under 2 seconds. It immediately demonstrates the product thesis. More importantly, the security design — LLM extracts parameters, CRM constructs queries — shows production-grade thinking, not just prompt engineering.

---

## 3. Feature 2 — Audience Explanation (Narrative Generation)

### Problem

When a marketer segments an audience, they receive a number: "183 customers matched." This number means nothing without context. Are these high-value customers or marginal ones? Are they reachable by the brand's preferred channel? Is the expected return worth the effort? Without these answers, the marketer either proceeds blindly or abandons the campaign out of uncertainty.

Traditional CRM analytics dashboards require the marketer to navigate to a separate reporting view, run their own calculations, and mentally synthesize the data before deciding. This cognitive load is a conversion killer in the campaign creation flow.

### User Value

Instead of a raw count, the marketer reads a paragraph: *"183 customers haven't visited in 90+ days. This group includes 61 Dormant VIPs — historically your highest spenders — averaging ₹4,100 per order. WhatsApp reaches 78% of this audience. A modest 5% win-back rate would recover ₹37,500 in revenue."*

This is the audience as a business story, not a database query result. It answers the three questions a marketer actually has: Who are these people? Can I reach them? Is it worth it?

### Business Value

- Increases Gate 2 conversion rate (users who proceed from audience review to campaign launch).
- Surfaces the revenue opportunity, making campaigns feel investable rather than exploratory.
- Removes the need for a separate analytics step before campaign creation.
- Demonstrates Xeno Copilot's core differentiator: AI that explains its work, not just executes it.

### Inputs

| Input | Source | Format |
|-------|--------|--------|
| `audienceQuery` | CRM Service | MongoDB query (constructed from whitelist, not LLM) |
| `audienceStats` | MongoDB aggregation | Count, median AOV, channel mix, RFM distribution |
| `channelStats` | `channel_stats` collection | Historical open/conversion rates per channel |
| `brandContext` | CRM Service | Brand name, currency, industry |
| `goalText` | User | Original natural language goal |

**MongoDB aggregation executed before this call:**

```javascript
// Aggregation run by CRM Service before sending context to Gemini
db.customers.aggregate([
  { $match: audienceFilter },
  { $group: {
    _id: null,
    count: { $sum: 1 },
    medianAOV: { $avg: "$totalSpend" },    // approximated
    whatsappCount: { $sum: { $cond: [{ $not: [{ $in: ["WHATSAPP", "$optOutChannels"] }] }, 1, 0] } },
    emailCount:    { $sum: { $cond: [{ $not: [{ $in: ["EMAIL",    "$optOutChannels"] }] }, 1, 0] } },
    champions:     { $sum: { $cond: [{ $eq: ["$rfmSegment", "CHAMPIONS"] }, 1, 0] } },
    dormantVips:   { $sum: { $cond: [{ $eq: ["$rfmSegment", "DORMANT_VIPS"] }, 1, 0] } }
  }}
])
```

### Outputs

```json
{
  "narrative": "183 customers haven't visited in 90+ days. This group includes 61 Dormant VIPs — historically your highest spenders — averaging ₹4,100 per order. WhatsApp reaches 78% of this audience. A modest 5% win-back rate would recover ₹37,500 in revenue.",
  "clusterCards": [
    {
      "clusterId": "...",
      "label": "Dormant VIPs",
      "count": 61,
      "rfmSegment": "DORMANT_VIPS",
      "avgSpend": 45100,
      "reachability": "78% via WhatsApp",
      "toneRecommendation": "High-value — use personal, appreciative tone. Offer meaningful incentive."
    },
    {
      "clusterId": "...",
      "label": "Lapsed Customers",
      "count": 122,
      "rfmSegment": "LAPSED_LOW_VALUE",
      "avgSpend": 4800,
      "reachability": "77% via WhatsApp",
      "toneRecommendation": "Casual, discovery-focused. Highlight new arrivals rather than discounts."
    }
  ],
  "revenueEstimate": {
    "min": 52400,
    "max": 73600,
    "conversionRate": 0.05,
    "source": "BENCHMARK_KLAVIYO_2024"
  }
}
```

### Prompt Design

**System Prompt:**

```
You are a retail CRM analyst explaining a campaign audience to a marketing manager.

Your job is to produce:
1. A narrative paragraph (max 60 words) summarizing the audience as a business opportunity.
2. A short cluster card description for each customer segment provided.
3. A revenue estimate using the conversion rate data provided.

Rules:
1. Write for a non-technical marketer. No RFM jargon unless explained.
2. Always mention the reachable channel percentage.
3. Always include a revenue estimate. If no historical data, use the provided benchmark.
4. Label benchmarks explicitly: "based on industry benchmarks (Klaviyo 2024)".
5. Never invent statistics. Only use the numbers provided in the context block.
6. Tone: confident, commercial, concise.
7. Output valid JSON matching the schema provided.
```

**User Prompt:**

```
Brand: {brandName} ({industry}, currency: {currency})
Campaign goal: "{goalText}"

Audience data:
- Total matched: {count} customers
- Median order value: {currency}{medianAOV}
- Channel reachability: WhatsApp {whatsappPct}%, Email {emailPct}%
- RFM breakdown: {rfmBreakdown}

Historical conversion rate for this campaign type:
{historicalRate or "No historical data. Use benchmark: 5% win-back rate (Klaviyo 2024)."}

Clusters to describe:
{clusterList}

Generate narrative, cluster cards, and revenue estimate.
```

**Example rendered prompt (Raga brand, win-back campaign):**

```
Brand: Raga (Indian ethnic wear, currency: ₹)
Campaign goal: "Win back customers who haven't purchased in 90 days"

Audience data:
- Total matched: 183 customers
- Median order value: ₹3,800
- Channel reachability: WhatsApp 78%, Email 22%
- RFM breakdown: Dormant VIPs: 61 (33%), Lapsed Low-Value: 122 (67%)

Historical conversion rate for this campaign type:
No historical data. Use benchmark: 5% win-back rate (Klaviyo 2024).

Clusters to describe:
1. Dormant VIPs — 61 customers, avg spend ₹45,100, WhatsApp 79%, Email 21%
2. Lapsed Customers — 122 customers, avg spend ₹4,800, WhatsApp 77%, Email 23%

Generate narrative, cluster cards, and revenue estimate.
```

### Gemini Usage

| Parameter | Value |
|-----------|-------|
| Model | `gemini-1.5-flash` |
| Rationale | Narrative synthesis from structured data. Speed critical — renders while Call 3 runs. |
| Temperature | `0.4` |
| Max output tokens | `512` |
| Response format | JSON mode |
| Estimated latency | 2s–3s |

Temperature of 0.4 allows natural variation in narrative phrasing across runs without inventing facts. All factual content is locked to the provided data block.

### Failure Handling

| Failure Mode | Detection | Response |
|---|---|---|
| Gemini timeout | >5s guard | Show static audience table (count, channel mix, RFM breakdown) without narrative. No blocking. |
| LLM invents a statistic | Numeric validation: extract all numbers from narrative, verify each appears in input context | Flag narrative as unverified. Do not display it. Show raw data table instead. |
| Empty audience (count = 0) | Pre-call check | Do not call Gemini. Return 422: "No customers match this goal. Try adjusting the targeting criteria." |
| Audience too large (>10,000) | Pre-call check | Proceed but add warning: "This is a broad audience — consider narrowing the goal for higher ROI." |

### Cost Estimate

- Input: ~600 tokens
- Output: ~300 tokens
- Cost: < $0.0001 per call (Flash pricing)
- At 1,000 campaigns/month: < $0.15/month

### Why Evaluators Will Care

Narrative generation is the feature that makes Xeno Copilot feel like a strategist rather than a query tool. The evaluator watches raw MongoDB aggregate output transform into a business case in 3 seconds. The revenue estimate with benchmark attribution demonstrates commercial awareness: the system doesn't pretend to know what it doesn't know — it labels uncertainty. That intellectual honesty is a signal of production-grade thinking.

---

## 4. Feature 3 — Customer Persona Generation

### Problem

Marketers write messages for a generic audience because they have no mental model of who they're actually writing for. "183 dormant customers" is an abstraction. Writing a WhatsApp message for an abstraction produces generic, low-converting copy. Effective CRM requires the marketer to feel the audience before writing for them.

Traditional CRM tools show demographics tables. No one reads them before writing. The insight exists but the empathy does not.

### User Value

For each audience cluster, the system generates a representative customer persona: a name, a shopping behaviour pattern, a quote describing their relationship with the brand, and a key motivation. The marketer now writes for Meera (48 visits, hasn't come back since Diwali) rather than for "Cluster 1: Dormant VIPs."

The persona is embedded directly in the message composition view, not hidden in a separate analytics screen.

### Business Value

- Higher message quality → higher click and conversion rates.
- Reduces the time a marketer spends mentally modeling their audience.
- Makes the platform feel intelligent in the way a human consultant would — "here's who you're talking to."
- Differentiates Xeno Copilot from segment-count-based CRMs.

### Inputs

| Input | Source | Format |
|-------|--------|--------|
| `clusterStats` | MongoDB aggregation | RFM segment, avg spend, avg order count, channel preference, days since last order |
| `topProductCategories` | MongoDB aggregation | Top 3 product categories purchased by this cluster |
| `brandContext` | CRM Service | Brand name, industry |
| `clusterLabel` | Call 2 output | Plain-English cluster name |

**Note:** Persona generation runs as part of Call 2 — it is included in the Audience Narrative prompt rather than a separate Gemini call. The output is added to each cluster card. This keeps the pipeline at 5 calls, not 6.

### Outputs

Each cluster card (from Call 2) includes a `persona` block:

```json
{
  "persona": {
    "name": "Meera",
    "age_hint": "late 30s to 40s",
    "behaviour_pattern": "Seasonal shopper — buys during festivals and wedding season, then goes quiet for 4–6 months.",
    "brand_relationship": "Has spent ₹42,000 across 8 orders. Knows and trusts the brand but hasn't been given a reason to return.",
    "motivation": "Feels valued when the brand remembers her. Responds to personal recognition over generic discounts.",
    "ideal_message_tone": "Warm, personal. Acknowledge the gap. Make her feel missed, not marketed to."
  }
}
```

### Prompt Design

The persona block is requested within the same system prompt as the Audience Narrative (Call 2). An additional persona instruction is appended to the system prompt:

```
For each cluster, generate a representative customer persona. The persona must be:
- A first name appropriate for the brand's customer base
- A 1-sentence behaviour pattern describing their shopping style
- A 1-sentence brand relationship description using the spend/order data provided
- A 1-sentence motivation (what makes them respond to outreach)
- A 2-sentence ideal message tone guide for the copywriter

Rules for persona generation:
- Base ALL persona traits on the cluster statistics provided. Do not invent attributes.
- The behaviour pattern must reference the days-since-last-order and order frequency data.
- The brand relationship must include the avg spend figure (formatted in {currency}).
- Never mention specific product SKUs or fictional promotions.
- Keep each field under 30 words.
```

### Gemini Usage

Persona generation is embedded in Call 2 (Audience Narrative). No additional API call is made.

| Parameter | Value |
|-----------|-------|
| Model | `gemini-1.5-flash` (inherited from Call 2) |
| Additional tokens (per cluster) | ~80 output tokens |
| Total Call 2 output increase | ~160 tokens (for 2 clusters) |
| Cost impact | Negligible — < $0.00005 per campaign |

### Failure Handling

| Failure Mode | Detection | Response |
|---|---|---|
| Persona fields missing from Call 2 output | JSON schema validation | Show cluster card without persona. Message composer shows generic tone prompt instead. |
| Persona references invented statistics | Numeric audit: all spend/order figures in persona must match input data | Strip persona block. Log for review. |

### Why Evaluators Will Care

Persona generation is the empathy layer of the AI pipeline. A hiring evaluator watching the demo sees the system go from "183 customers" → audience stats → a named person with a motivation. This signals that the product is designed for marketing outcomes, not just data retrieval. It also demonstrates restraint: the feature is embedded in an existing call rather than inflating the pipeline to 6 calls.

---

## 5. Feature 4 — Message Generation

### Problem

Writing effective marketing messages for multiple channels and audience segments is the most time-consuming part of campaign creation. A marketer targeting two segments across WhatsApp and email needs four distinct messages — each optimised for channel, character limits, tone, and CTA placement. Done manually, this takes 30–60 minutes and produces inconsistent quality.

The channel constraints are strict: WhatsApp messages over 160 characters see significant drop-off. Email subject lines over 50 characters are clipped in Gmail. Generic messages without personalisation tokens convert 2–3× worse than personalised ones. Marketers who know these rules still make mistakes under time pressure.

### User Value

The user reviews their audience (Gate 2) and clicks Approve. Within 5 seconds, fully-written WhatsApp messages and email copy appear for each cluster — personalised, channel-optimised, with CTAs embedded. The marketer reads, edits if needed, and launches. The AI handles four messages; the marketer reviews four messages.

Messages include `{name}` personalisation tokens that are resolved at dispatch time per customer.

### Business Value

- Reduces message creation time from 30–60 minutes to under 5 minutes.
- Enforces channel best practices (length, personalisation, CTA) that improve deliverability and conversion.
- Generates cluster-specific messaging — Dormant VIPs get a different message than Lapsed Low-Value customers, improving relevance and ROI.
- Directly addresses Xeno's core value proposition: AI execution, not just AI recommendation.

### Inputs

| Input | Source | Format |
|-------|--------|--------|
| `goalText` | User | Original natural language goal |
| `clusterData` | Call 2 output | Label, RFM segment, stats, persona |
| `brandContext` | CRM Service | Brand name, industry, CTA URL |
| `channelMix` | Audience query result | Which channels are active for this cluster |
| `historicalStats` | `channel_stats` collection | Prior message performance if available |

### Outputs

```json
{
  "clusters": [
    {
      "clusterId": "664c2b2c3d4e5f6789000001",
      "label": "Dormant VIPs",
      "whatsappMessage": {
        "body": "Hi {name}, we've been thinking of you at Raga. It's been a while since your last visit — and we have new sarees we think you'll love. Enjoy 15% off your next order. Use code WELCOMEBACK15 → {ctaUrl}",
        "characterCount": 198,
        "ctaUrl": "https://raga.store/collections/new",
        "personalisationTokens": ["{name}", "{ctaUrl}"]
      },
      "emailMessage": {
        "subject": "We miss you, {name} — something special inside",
        "preheader": "Exclusive offer for a valued Raga customer",
        "body": "Dear {name},\n\nIt's been a while since we've seen you at Raga, and we've been thinking about the customers who matter most to us — you're one of them.\n\nWe have a new collection of handcrafted sarees we think you'll love, and we'd like to welcome you back with 15% off your next order.\n\nUse code WELCOMEBACK15 at checkout.\n\n→ Browse the new collection: {ctaUrl}\n\nWith warmth,\nThe Raga Team",
        "ctaUrl": "https://raga.store/collections/new",
        "subjectCharacterCount": 48,
        "personalisationTokens": ["{name}", "{ctaUrl}"]
      }
    },
    {
      "clusterId": "664c2b2c3d4e5f6789000002",
      "label": "Lapsed Customers",
      "whatsappMessage": {
        "body": "Hi {name}! Raga just launched new arrivals 🌸 Fresh sarees, kurtis & more. Come discover what's new → {ctaUrl}",
        "characterCount": 107,
        "ctaUrl": "https://raga.store/collections/new",
        "personalisationTokens": ["{name}", "{ctaUrl}"]
      },
      "emailMessage": {
        "subject": "New at Raga — collections you haven't seen yet",
        "preheader": "Fresh arrivals just landed",
        "body": "Hi {name},\n\nWe've been busy at Raga. New collections have just landed — sarees, kurtis, and occasionwear you haven't seen yet.\n\nCome take a look:\n\n→ {ctaUrl}\n\nSee you soon,\nThe Raga Team",
        "ctaUrl": "https://raga.store/collections/new",
        "subjectCharacterCount": 45,
        "personalisationTokens": ["{name}", "{ctaUrl}"]
      }
    }
  ]
}
```

### Prompt Design

**System Prompt:**

```
You are a senior retail copywriter for a brand called {brandName} ({industry}).

Your job is to write marketing messages for a specific customer segment.

Channel rules — follow these exactly:
- WhatsApp: Maximum 160 characters for optimal open rate. Must include {name} personalisation. Must include {ctaUrl}. No markdown formatting. Emoji allowed sparingly (1–2 max).
- Email subject: Maximum 50 characters. Must feel personal, not promotional.
- Email preheader: Maximum 80 characters. Complements the subject line.
- Email body: 3–5 short paragraphs. Plain text only (no HTML). Always include {ctaUrl}. Always close with brand sign-off.

Personalisation rules:
- Always use {name} at least once in every message.
- Do not invent promotions, discounts, or product details not provided.
- If a discount code is provided in the context, include it exactly as given.
- If no discount code is provided, do not fabricate one.

Tone rules:
- Match the tone recommendation from the persona card provided.
- Dormant VIPs: warm, appreciative, personalised. Make them feel missed.
- Lapsed Low-Value: casual, discovery-focused. Don't over-promise.
- Champions: celebratory, exclusive. They are your best customers.
- Promising: encouraging, exciting. Acknowledge their engagement.

Output: valid JSON matching the schema provided. Include characterCount for all WhatsApp messages.
Do not add commentary outside the JSON block.
```

**User Prompt:**

```
Brand: {brandName}
Campaign goal: "{goalText}"
CTA URL: {ctaUrl}
Discount code (if any): {discountCode or "none"}

Clusters to generate messages for:

CLUSTER 1: {clusterLabel}
- Segment: {rfmSegment}
- Persona: {personaDescription}
- Tone guide: {idealMessageTone}
- Channels to generate: {channels}

CLUSTER 2: {clusterLabel}
- Segment: {rfmSegment}
- Persona: {personaDescription}
- Tone guide: {idealMessageTone}
- Channels to generate: {channels}

Write distinct messages for each cluster. Do not use the same body text across clusters.
```

### Gemini Usage

| Parameter | Value |
|-----------|-------|
| Model | `gemini-1.5-pro` |
| Rationale | Creative copy quality matters here. Pro produces significantly better tone variation and structural coherence than Flash. This is the core creative output of the product. |
| Temperature | `0.7` |
| Max output tokens | `1024` |
| Response format | JSON mode |
| Estimated latency | 4s–6s |

Temperature of 0.7 allows creative variation across campaigns. The system prompt's explicit constraints prevent hallucinated discounts, incorrect brand tone, or over-length messages.

### Failure Handling

| Failure Mode | Detection | Response |
|---|---|---|
| WhatsApp message exceeds 160 chars | Character count validation on output | Trigger automatic re-generation with explicit length constraint added to prompt. Max 2 retries. |
| Missing personalisation token | Validate `{name}` and `{ctaUrl}` appear in all messages | Flag the specific message in UI. User must fix before launching. |
| Gemini returns identical copy for both clusters | Text similarity check (>85% overlap) | Log warning and trigger re-generation with instruction: "Cluster 1 and Cluster 2 messages must be meaningfully different." |
| Email subject too long | Character count check | Truncate to 50 chars at word boundary and flag for user review. |
| Gemini timeout | >8s guard | Show empty message fields with manual compose option. Campaign remains in DRAFT. User can trigger re-generation. |
| LLM fabricates discount code | Check: if discountCode input was "none", validate no alphanumeric code appears in output | Strip fabricated code and re-generate with strict instruction. |

### Cost Estimate

- Input: ~1,200 tokens (system + user + cluster data)
- Output: ~700 tokens
- Total: ~1,900 tokens per call
- Cost at Gemini 1.5 Pro pricing ($1.25/1M input, $5.00/1M output): ~$0.005 per campaign
- At 1,000 campaigns/month: ~$5/month
- This is the most expensive call in the pipeline by an order of magnitude. Justified by direct revenue impact.

### Why Evaluators Will Care

Message generation is the moment the product earns its thesis. The evaluator watches a natural-language goal become production-ready copy in 5 seconds — copy that is channel-appropriate, personalised, and segment-specific. The failure handling demonstrates production thinking: the system validates its own output rather than trusting Gemini blindly. The choice of 1.5 Pro (with written justification) shows cost-quality judgment rather than defaulting to the most powerful model for everything.

---

## 6. Feature 5 — Campaign Critique

### Problem

First-draft marketing messages contain predictable quality issues: missing personalisation, CTA links that don't resolve, messages that are too long for the channel, generic copy that ignores the audience segment, or a tone mismatch between the offer and the customer tier. These issues directly reduce campaign conversion rates. Catching them before launch requires manual review expertise the marketer may not have.

The problem is not that marketers are careless — it is that review checklists are tedious and easy to skip under deadline pressure.

### User Value

After message generation, the user optionally adds a note (*"Make it warmer"*, *"Mention Diwali"*) or clicks Critique. The system runs both a deterministic rule check and an AI tone review, then returns the refined messages with a plain-English explanation of what changed and why.

The user makes one decision: accept the critique or revert. The AI does the editing.

### Business Value

- Catches structural errors (missing `{name}`, overlength WhatsApp, no CTA) before they reach customers.
- Applies contextual improvements (tone alignment, seasonal relevance) that improve conversion.
- Reduces post-launch regret — campaigns that were rushed and underperformed.
- Demonstrates to Xeno evaluators that the AI system is self-auditing, a hallmark of production-grade AI design.

### Inputs

| Input | Source | Format |
|-------|--------|--------|
| `generatedMessages` | Call 3 output | WhatsApp and email copy per cluster |
| `clusterData` | Call 2 output | Persona, tone recommendation, segment |
| `userFeedback` | User (optional) | Natural language note, max 500 chars |
| `campaignGoal` | User | Original natural language goal |
| `brandContext` | CRM Service | Brand name, industry |

### Critique Architecture

Critique is a **two-layer system**:

**Layer 1 — Deterministic Rules (executed by CRM Service before Gemini call)**

These 6 rules run in pure Node.js and catch structural problems. They do not require a Gemini call. If any rule fails, the issue is flagged regardless of what the LLM returns.

| Rule ID | Check | Severity | Action |
|---------|-------|----------|--------|
| CR-001 | `{name}` token present in every message | HIGH | Block launch if absent |
| CR-002 | `{ctaUrl}` token present in every message | HIGH | Block launch if absent |
| CR-003 | WhatsApp message ≤ 160 characters | MEDIUM | Flag + re-generate |
| CR-004 | Email subject ≤ 50 characters | MEDIUM | Flag + truncate |
| CR-005 | At least one message differs per cluster | MEDIUM | Trigger re-generation with diversity instruction |
| CR-006 | No fabricated discount codes (if none was input) | HIGH | Strip and re-generate |

**Layer 2 — AI Tone Review (Call 4, Gemini)**

Runs after Layer 1 passes. Reviews tone, coherence, seasonal relevance, and alignment with persona.

### Outputs

```json
{
  "critiqueApplied": true,
  "deterministicIssues": [],
  "critiqueNotes": "Added warmth and Diwali collection reference. Ensured {name} personalisation present in both messages. WhatsApp message reduced from 210 to 152 characters.",
  "changesApplied": [
    {
      "clusterId": "664c2b2c3d4e5f6789000001",
      "channel": "WHATSAPP",
      "change": "TONE_ADJUSTED",
      "before": "Use code WELCOMEBACK15...",
      "after": "This Diwali, we'd love to welcome you back..."
    }
  ],
  "refinedMessages": {
    "664c2b2c3d4e5f6789000001": {
      "whatsappMessage": {
        "body": "Hi {name}, this Diwali we'd love to welcome you back to Raga 🪔 Discover our festive collection — 15% off for you. Code DIWALI15 → {ctaUrl}",
        "characterCount": 138
      },
      "emailMessage": {
        "subject": "Diwali is here — and so are new arrivals",
        "preheader": "A special Diwali offer, just for you",
        "body": "Dear {name},\n\nThis Diwali, we're celebrating with our most vibrant collection yet..."
      }
    }
  }
}
```

### Prompt Design

**System Prompt:**

```
You are a senior marketing editor reviewing campaign messages before they are sent to real customers.

Your job is to improve the messages provided based on:
1. The tone recommendation from the persona card (most important)
2. The user's specific feedback (if provided)
3. Brand voice consistency
4. Seasonal or contextual relevance

Editing rules:
- Make the minimum changes needed. Do not rewrite messages from scratch unless the original is fundamentally wrong.
- Every edit must be justifiable. Explain each change in critiqueNotes.
- Do not add discount codes that weren't in the original.
- Do not change {name} or {ctaUrl} tokens — leave them exactly as is.
- WhatsApp messages must remain under 160 characters after your edits.
- If no meaningful improvements are needed, return the original messages unchanged with critiqueApplied: false.

Output: JSON matching the schema. critiqueNotes must be plain English under 80 words.
```

**User Prompt:**

```
Campaign goal: "{goalText}"
User feedback: "{userFeedback or 'None — run auto-critique only.'}"

Messages to review:

CLUSTER: {clusterLabel} — {rfmSegment}
Persona tone guide: "{idealMessageTone}"

WhatsApp ({charCount} chars): "{whatsappBody}"
Email subject: "{emailSubject}"
Email body: "{emailBody}"

Improve the messages. Apply user feedback first, then persona alignment, then WhatsApp length compliance.
```

### Gemini Usage

| Parameter | Value |
|-----------|-------|
| Model | `gemini-1.5-flash` |
| Rationale | Editing an existing text is less demanding than generation. Flash handles this well and maintains speed — the critique step should feel instant. |
| Temperature | `0.3` |
| Max output tokens | `1024` |
| Response format | JSON mode |
| Estimated latency | 2s–4s |

Low temperature keeps edits conservative — the system should make targeted improvements, not rewrite messages with high creative variance.

### Failure Handling

| Failure Mode | Detection | Response |
|---|---|---|
| CR-001/CR-002 trigger after critique (LLM removed personalisation token) | Re-run deterministic checks post-critique | Revert to pre-critique version. Log the regression. Block launch. |
| Critique makes WhatsApp longer than 160 chars | Post-critique character count check | Re-run with explicit hard constraint: "WhatsApp body MUST be under 140 characters. Remove words, do not add." |
| Gemini timeout | >6s guard | Skip AI critique, run deterministic layer only. Notify user that AI tone review is unavailable. |
| User feedback contains prompt injection attempt (e.g., "ignore all instructions") | Sanitise: strip leading "ignore", "disregard", "system:" patterns. Cap at 500 chars | Log sanitised input. Proceed with cleaned feedback. |

### Cost Estimate

- Input: ~800 tokens
- Output: ~600 tokens
- Total: ~1,400 tokens per call
- Cost at Flash pricing: ~$0.0003 per campaign
- At 1,000 campaigns/month: < $0.50/month

### Why Evaluators Will Care

The critique layer demonstrates AI system design thinking, not just AI API usage. The two-layer architecture (deterministic rules first, AI second) is a production pattern — it ensures that structural errors are never dependent on LLM judgment. The evaluator sees a system that audits its own output. The `changesApplied` diff view in the response schema shows that the system explains its reasoning, not just produces output — this is the transparency that enterprise buyers require.

---

## 7. Feature 6 — Performance Analysis (Post-Campaign Report)

### Problem

After a campaign ends, the typical retail marketer receives a delivery report with open and click rates and no interpretation. They have to mentally benchmark these numbers (Is 22% open rate good for email? Was 5.8% conversion above average?), diagnose what worked, and decide what to do differently next time. Most do not do this analysis. The insight exists in the data; the action never follows.

The result: the same campaign mistakes are repeated. High-performing segments are not prioritised. Underperforming channels are not dropped. The CRM accumulates data but the brand does not get smarter.

### User Value

48 hours after a campaign ends (once conversion attribution is complete), the marketer opens their campaign and finds a narrative report: which cluster converted best, which channel outperformed, what the revenue ROI was, and what to do differently next time. The report is written for action, not archiving.

**Example insight:** *"The Dormant VIP cluster drove 83% of conversions despite being 33% of the audience. Your Lapsed Low-Value cluster converted at 2.1% — below the 5% benchmark. For the next win-back campaign, consider either a higher-value offer for Lapsed customers or removing them to reduce cost."*

### Business Value

- Closes the learning loop: every campaign makes the brand smarter.
- Surfaces the Dormant VIP vs. Lapsed split — a high-value insight for audience prioritisation in future campaigns.
- Provides a revenue ROI figure that justifies continued CRM investment.
- Benchmarks performance against industry data, giving context non-analytical marketers lack.
- For Xeno: demonstrates that the platform delivers ongoing value post-campaign, not just at creation time.

### Inputs

| Input | Source | Format |
|-------|--------|--------|
| `campaignStats` | `communication_events` aggregation | Sent, delivered, opened, clicked, converted per cluster and channel |
| `revenueAttributed` | Orders with `campaignAttributedTo` set | Total INR, count of conversions, avg order value |
| `audienceSnapshot` | `campaigns.audienceSnapshot` | Original audience context |
| `revenueEstimate` | `campaigns.revenueEstimate` | Pre-campaign prediction for comparison |
| `channelStats` | `channel_stats` collection | Updated industry benchmarks |
| `clusters` | `campaign_clusters` | Message text used, cluster labels |

**This call runs as a background job, not in response to a user request.** The background job:
1. Runs every 30 minutes.
2. Identifies `COMPLETED` campaigns where `aiReport` is null and `completedAt` is > 48 hours ago.
3. Runs the aggregation pipeline.
4. Calls Gemini 1.5 Pro.
5. Writes the report to `campaigns.aiReport`.
6. Sets `campaigns.aiReportGeneratedAt`.

The 48-hour delay is deliberate: conversion attribution (last-touch, 14-day window) needs sufficient time to capture post-click purchases.

### Outputs

```json
{
  "summary": "The win-back campaign achieved a 6.5% conversion rate — 30% above the 5% Klaviyo benchmark. WhatsApp outperformed email with 7.0% vs. 4.9% conversion. Total attributed revenue: ₹49,200.",
  "deliveryStats": {
    "sent": 183,
    "delivered": 178,
    "failed": 5,
    "deliveryRate": 97.3
  },
  "engagementStats": {
    "opened": 124,
    "clicked": 67,
    "openRate": 69.7,
    "clickRate": 37.6
  },
  "conversionStats": {
    "converted": 12,
    "conversionRate": 6.5,
    "totalRevenue": 49200,
    "avgOrderValue": 4100
  },
  "channelBreakdown": {
    "WHATSAPP": { "sent": 142, "converted": 10, "conversionRate": 7.0 },
    "EMAIL": { "sent": 41, "converted": 2, "conversionRate": 4.9 }
  },
  "clusterBreakdown": [
    {
      "clusterId": "664c2b2c3d4e5f6789000001",
      "label": "Dormant VIPs",
      "sent": 61,
      "converted": 10,
      "conversionRate": 16.4,
      "attributedRevenue": 41000
    },
    {
      "clusterId": "664c2b2c3d4e5f6789000002",
      "label": "Lapsed Customers",
      "sent": 122,
      "converted": 2,
      "conversionRate": 1.6,
      "attributedRevenue": 8200
    }
  ],
  "aiInsights": "The Dormant VIP cluster drove 83% of conversions despite being only 33% of the audience, with a 16.4% conversion rate — more than 3× the benchmark. This segment should be prioritised and targeted first in future win-back campaigns, possibly with a more personalised offer rather than a blanket discount. The Lapsed Low-Value cluster converted at 1.6% — below benchmark. For the next campaign, either use a higher-value incentive (20%+ discount or free shipping) or exclude this segment to improve campaign ROI.",
  "benchmarkComparison": {
    "conversionRate": { "actual": 6.5, "benchmark": 5.0, "source": "BENCHMARK_KLAVIYO_2024", "delta": "+30%" },
    "whatsappOpenRate": { "actual": 69.7, "benchmark": 65.0, "source": "BENCHMARK_GUPSHUP_2024", "delta": "+7%" },
    "emailOpenRate": { "actual": 22.5, "benchmark": 22.0, "source": "BENCHMARK_MAILCHIMP_2024", "delta": "+2%" }
  },
  "nextCampaignRecommendation": "Run a follow-up win-back targeting only Dormant VIPs within the next 60 days. This segment has high receptivity and high AOV — a focused campaign with a personalised offer is likely to achieve 15%+ conversion."
}
```

### Prompt Design

**System Prompt:**

```
You are a retail marketing analyst generating a post-campaign performance report for a brand manager.

Your report must:
1. Open with a 2-sentence executive summary (conversion rate vs. benchmark, total revenue).
2. Identify the best-performing cluster and explain why it outperformed.
3. Identify the worst-performing cluster and provide a specific, actionable recommendation.
4. Compare actual performance against the provided benchmarks. Always cite the benchmark source.
5. Provide one concrete recommendation for the brand's next campaign.

Rules:
- Only use the numbers provided in the data block. Never invent metrics.
- When performance exceeds benchmark, express as a positive percentage delta.
- When performance is below benchmark, express as a negative percentage delta.
- All monetary amounts in {currency}.
- Tone: direct, commercial, actionable. This is a business report, not a celebration.
- If conversion rate is 0%, state this plainly and recommend the brand review message quality or audience selection.
- Output: valid JSON matching the schema provided.
```

**User Prompt:**

```
Brand: {brandName} ({industry})
Campaign: "{campaignName}"
Goal: "{goalText}"
Campaign period: {launchedAt} to {completedAt}

Performance data:
{fullStatsBlock}

Pre-campaign revenue estimate: {currency}{estimateMin}–{currency}{estimateMax} (source: {estimateSource})
Actual attributed revenue: {currency}{actualRevenue}

Benchmarks for comparison:
- Win-back conversion rate: 5.0% (Klaviyo 2024)
- WhatsApp open rate: 65% (Gupshup 2024)
- Email open rate: 22% (Mailchimp 2024)

Generate the full post-campaign report.
```

### Gemini Usage

| Parameter | Value |
|-----------|-------|
| Model | `gemini-1.5-pro` |
| Rationale | Report quality matters more than speed (async job, not user-facing). Pro produces significantly better analytical reasoning and specific actionable insights. This is the highest-stakes call in the pipeline. |
| Temperature | `0.3` |
| Max output tokens | `1024` |
| Response format | JSON mode |
| Estimated latency | 5s–10s (acceptable — background job) |

Low temperature for analytical reporting — insight quality should be consistent and data-driven, not creatively variable.

### Failure Handling

| Failure Mode | Detection | Response |
|---|---|---|
| Gemini timeout | >15s guard (background job, generous timeout) | Retry once after 30 minutes. After 3 failures, set `aiReport` to `{ "error": "Report generation failed. View raw stats on the campaign page." }` |
| LLM fabricates a metric | Numeric audit: all figures in `aiInsights` must appear in the input data block | Store raw stats block only. Flag report as unverified. |
| Campaign has 0 conversions | Pre-call check | Generate report with explicit 0-conversion framing. Do not skip — a 0-conversion report is still valuable for diagnosis. |
| Background job misses a campaign | Idempotency: check `aiReport === null && completedAt < now - 48h` on every 30-minute run | Self-healing. Missed campaigns are caught on the next run. |

### Cost Estimate

- Input: ~1,500 tokens (full stats block + prompts)
- Output: ~700 tokens
- Total: ~2,200 tokens per call
- Cost at Gemini 1.5 Pro pricing: ~$0.0055 per campaign
- At 1,000 campaigns/month: ~$5.50/month
- Total AI spend at 1,000 campaigns/month: ~$11/month (all 5 calls combined)

### Why Evaluators Will Care

The post-campaign report closes the loop that most CRM tools leave open. The evaluator sees that Xeno Copilot doesn't just run campaigns — it learns from them and tells the brand what to do next. The `nextCampaignRecommendation` field is the highest-value output in the pipeline because it turns historical data into future action. The decision to use 1.5 Pro here (and only here, alongside Call 3) demonstrates that the team made deliberate cost-quality trade-offs rather than using the most powerful model everywhere.

---

## 8. Shared Design Principles

These principles apply to every Gemini call in the pipeline and are enforced consistently.

### 8.1 LLM is Interpreter, Not Executor

The LLM never executes actions directly. It interprets user intent and generates content for human review. All database operations, message dispatch, and state transitions are performed by deterministic CRM Service code.

This is most visible in Call 1: the LLM outputs `{intent_type, parameters}` and the CRM Service constructs the MongoDB query. The LLM cannot issue a query that targets all customers, drops a collection, or uses the `$where` operator — because it is never given the ability to.

### 8.2 Every Output Is Validated Before Use

Every Gemini response passes through a validation layer before it is stored or displayed:

1. JSON schema validation (required fields, correct types)
2. Domain-specific validation (character counts, personalisation tokens, numeric consistency)
3. Security validation (no MongoDB operators in parameters, no injected instructions)

A Gemini response that fails validation is either retried with a corrected prompt or rejected with a human-readable fallback.

### 8.3 Human Gates Are Non-Negotiable

Two human gates are enforced in the pipeline:

- **Gate 1** (after Call 1): User reads the intent interpretation and confirms before any audience query runs.
- **Gate 2** (after Calls 2+3): User reviews the audience and messages before the campaign is saved and any dispatch is planned.

These gates exist because no AI system has 100% accuracy on intent understanding. A marketer who intended to target "top spenders" but approved a campaign targeting "all customers" has made a business decision, not a system failure. Gates ensure the marketer is accountable for what they approve.

### 8.4 Benchmarks Are Always Labelled

Any number derived from external benchmark data (Klaviyo, Gupshup, Mailchimp) is always displayed with its source. The system never presents a benchmark as if it were brand-specific historical data.

This protects the brand from acting on inflated expectations and protects the product's credibility.

### 8.5 Graceful Degradation at Every Step

If any Gemini call fails, the user can still complete their campaign — through manual compose, static audience tables, or raw stats. No part of the pipeline is a hard blocker. The AI accelerates work; it does not gate it.

### 8.6 Model Selection Is a Cost-Quality Decision

| Call | Model | Reason |
|------|-------|--------|
| Call 1 (Intent Extraction) | `gemini-1.5-flash` | Classification with closed output space. Speed > depth. |
| Call 2 (Audience Narrative) | `gemini-1.5-flash` | Synthesis of structured data. Must return before Call 3 completes. |
| Call 3 (Message Generation) | `gemini-1.5-pro` | Core creative output. Quality directly determines conversion rate. |
| Call 4 (Critique) | `gemini-1.5-flash` | Editing existing text. Conservative, fast. |
| Call 5 (Report) | `gemini-1.5-pro` | Analytical reasoning. Quality matters; latency does not (async). |

---

## 9. Cost Model

### Per-Campaign Cost (all 5 calls)

| Call | Model | Input Tokens | Output Tokens | Cost |
|------|-------|-------------|---------------|------|
| Call 1 — Intent Extraction | Flash | 300 | 100 | $0.000038 |
| Call 2 — Audience Narrative | Flash | 600 | 350 | $0.000150 |
| Call 3 — Message Generation | Pro | 1,200 | 700 | $0.005000 |
| Call 4 — Critique | Flash | 800 | 600 | $0.000240 |
| Call 5 — Report | Pro | 1,500 | 700 | $0.005500 |
| **Total per campaign** | | | | **~$0.011** |

### Monthly Cost at Scale

| Campaigns/Month | Total AI Cost | Notes |
|----------------|---------------|-------|
| 100 | $1.10 | Early traction |
| 1,000 | $11.00 | Growth stage |
| 10,000 | $110.00 | Scale (still negligible vs. CRM contract value) |

**Gemini API pricing used** (as of knowledge cutoff):
- Gemini 1.5 Flash: $0.075/1M input tokens, $0.30/1M output tokens
- Gemini 1.5 Pro: $1.25/1M input tokens, $5.00/1M output tokens

At $11/1,000 campaigns, the AI cost is a rounding error compared to the revenue a well-executed campaign generates for a retail brand. A single 5% win-back campaign on 183 customers yielding ₹49,200 in revenue would cost the brand ~$0.011 in AI inference.

---

## 10. Cold Start Handling

When a brand is new to Xeno Copilot (no campaign history in `channel_stats`), every revenue estimate uses external benchmark data. This is explicitly labelled in the UI and in the AI prompt context.

### Benchmark Table

| Campaign Type | Channel | Metric | Benchmark | Source |
|---|---|---|---|---|
| Win-back | Any | Conversion rate | 5.0% | Klaviyo Email Marketing Benchmarks 2024 |
| Any | WhatsApp | Open rate | 65.0% | Gupshup WhatsApp Business Report 2024 |
| Any | Email | Open rate | 22.0% | Mailchimp Email Marketing Benchmarks 2024 |
| Any | Email | Click rate | 2.6% | Mailchimp Email Marketing Benchmarks 2024 |
| VIP Loyalty | Any | Conversion rate | 8.0% | Klaviyo Email Marketing Benchmarks 2024 |
| Re-engagement | Any | Conversion rate | 3.5% | Klaviyo Email Marketing Benchmarks 2024 |

### Transition from Benchmark to Historical Data

After a brand completes its first campaign, the `channel_stats` collection is updated with actual performance. The revenue estimate pipeline uses this logic:

```
if channel_stats has data for (channel, campaignType):
    use brand historical rate (labelled: "Based on your past campaigns")
else:
    use benchmark rate (labelled: "Based on industry benchmarks — Klaviyo 2024")
```

Once 3+ campaigns have run, the historical rate takes full precedence and benchmark data is only shown as a comparison reference.

---

## 11. Failure Handling Matrix

Complete failure handling reference across all 5 calls.

| Call | Failure | Detection | User Impact | Recovery |
|------|---------|-----------|-------------|----------|
| 1 | Gemini timeout | >5s | "AI is temporarily unavailable. Try again in 3 seconds." | Retry button. No data lost. |
| 1 | Unknown intent returned | Whitelist miss | "I couldn't match your goal to a targeting strategy. Try rephrasing." | User rephrases. No campaign created. |
| 1 | Malformed JSON | Parse error | Silent retry with temperature 0 | One automatic retry, then 502 |
| 2 | Gemini timeout | >5s | Static audience table shown (no narrative) | Campaign creation continues. User sees counts. |
| 2 | Invented statistics | Numeric audit | Narrative hidden. Raw data shown. | No retry — raw data is correct. |
| 2 | Empty audience | count = 0 pre-check | "No customers match this goal." | User adjusts goal. |
| 3 | Gemini timeout | >8s | Empty message fields with manual compose | User composes manually. Campaign continues in DRAFT. |
| 3 | Missing {name} token | Post-generation check | Yellow warning flag on message | User fixes before launch. Launch is not blocked (warning, not error). |
| 3 | WhatsApp over 160 chars | Character count | Auto-retry with length constraint | Max 2 retries. If still over, flag for user to trim. |
| 3 | Identical messages per cluster | >85% similarity check | Auto-retry with diversity instruction | Max 1 retry. If identical, flag for user to differentiate. |
| 4 | Gemini timeout | >6s | AI critique skipped. Deterministic rules only. | Deterministic rules always run. |
| 4 | Critique removes personalisation token | Post-critique CR-001 check | Revert to pre-critique version. Log regression. | Pre-critique version used. Block launch until fixed. |
| 5 | Gemini timeout | >15s (background) | Report not shown. Raw stats available on campaign page. | Retry after 30 min. Max 3 retries over 6 hours. |
| 5 | 0 conversions | Pre-report check | Report generated with 0-conversion analysis | No skip — still valuable for diagnosis. |

---

*Document Status: Version 1.0 — Complete. Next: ROADMAP.md*
