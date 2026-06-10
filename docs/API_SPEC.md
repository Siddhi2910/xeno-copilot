# API Specification

**Version:** 1.0  
**Base URL (CRM Service):** `https://xeno-copilot-crm.onrender.com/api/v1`  
**Base URL (Channel Service):** `https://xeno-copilot-channel.onrender.com`  
**Frontend Origin:** `https://xeno-copilot.vercel.app`

---

## Table of Contents

1. [Conventions](#1-conventions)
2. [Authentication](#2-authentication)
3. [Error Format](#3-error-format)
4. [Customers](#4-customers)
5. [Orders](#5-orders)
6. [Import Jobs](#6-import-jobs)
7. [Segments & RFM](#7-segments--rfm)
8. [Campaigns — Core CRUD](#8-campaigns--core-crud)
9. [Campaigns — AI Pipeline](#9-campaigns--ai-pipeline)
10. [Campaigns — Launch & Lifecycle](#10-campaigns--launch--lifecycle)
11. [Analytics](#11-analytics)
12. [AI Logs](#12-ai-logs)
13. [Channel Service — Dispatch](#13-channel-service--dispatch)
14. [Channel Service — Callbacks](#14-channel-service--callbacks)
15. [Click Tracking](#15-click-tracking)
16. [Health Checks](#16-health-checks)
17. [Webhook Event Reference](#17-webhook-event-reference)

---

## 1. Conventions

### HTTP Methods

| Method | Semantics |
|--------|-----------|
| `GET` | Read. Idempotent. No body. |
| `POST` | Create or trigger an action. Body required. |
| `PATCH` | Partial update of an existing resource. |
| `DELETE` | Soft-delete or cancel a resource. |

### Pagination

All list endpoints that may return more than 20 items support cursor-based pagination:

```
GET /customers?limit=50&cursor=<opaque_cursor>
```

Response envelope:

```json
{
  "data": [...],
  "pagination": {
    "hasMore": true,
    "nextCursor": "eyJfaWQiOiI2NjQ...",
    "total": 1000
  }
}
```

- `cursor` is a base64-encoded MongoDB `_id` (last document of previous page).
- `total` is an approximate count (MongoDB `estimatedDocumentCount`). Exact count is expensive on large collections.
- Default `limit`: 20. Maximum `limit`: 200.

### Timestamps

All timestamps are **ISO 8601 UTC** strings: `"2025-04-15T10:30:00.000Z"`.

### ObjectId References

All `_id` fields and foreign key fields are returned as **hex strings** (24 characters), not raw ObjectId objects.

### Status Enums

All status values are **SCREAMING_SNAKE_CASE** as defined in DATABASE_SCHEMA.md. The API never normalizes or lowercases them.

---

## 2. Authentication

### V1 Strategy

V1 uses a single **Bearer token** per brand. The token is set as an environment variable (`API_SECRET_TOKEN`) and is required on every CRM Service request except `/health`.

The Channel Service uses **HMAC-SHA256** signatures on callback payloads (not Bearer tokens) — see §14.

**Future (V2):** Replace with JWT + brand-scoped claims for multi-tenancy.

### Request Header

```
Authorization: Bearer <token>
```

### Missing / Invalid Token Response

```json
HTTP/1.1 401 Unauthorized
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Missing or invalid Authorization header."
  }
}
```

---

## 3. Error Format

All errors return a consistent JSON envelope:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description.",
    "field": "fieldName",       // present only for validation errors
    "details": {}               // present only when additional context exists
  }
}
```

### Standard Error Codes

| HTTP Status | Code | When |
|-------------|------|------|
| 400 | `VALIDATION_ERROR` | Request body fails schema validation |
| 400 | `INVALID_CURSOR` | Malformed pagination cursor |
| 401 | `UNAUTHORIZED` | Missing or invalid Bearer token |
| 403 | `FORBIDDEN` | Token valid but insufficient scope |
| 404 | `NOT_FOUND` | Resource does not exist |
| 409 | `CONFLICT` | Unique constraint violation (e.g., duplicate phone) |
| 422 | `UNPROCESSABLE` | Request is structurally valid but logically invalid |
| 429 | `RATE_LIMITED` | Too many requests (Gemini API quota guard) |
| 500 | `INTERNAL_ERROR` | Unexpected server error |
| 502 | `AI_UNAVAILABLE` | Gemini API returned an error or timed out |
| 503 | `SERVICE_UNAVAILABLE` | Channel Service unreachable |

---

## 4. Customers

### 4.1 List Customers

```
GET /customers
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | integer | Page size. Default: 20. Max: 200. |
| `cursor` | string | Pagination cursor from previous response. |
| `rfmSegment` | string | Filter by RFM segment. |
| `channel` | string | Filter by opted-in channel. |
| `search` | string | Prefix search on name or phone (uses text index). Max 50 chars. |
| `tag` | string | Filter customers with this tag. |

**Response 200:**

```json
{
  "data": [
    {
      "_id": "664a1b2c3d4e5f6789abcdef",
      "brandId": "664a000000000000000000001",
      "phone": "+919876543210",
      "name": "Priya Sharma",
      "email": "priya.sharma@example.com",
      "source": "IMPORT",
      "tags": ["vip", "ethnic-wear"],
      "optOutChannels": [],
      "rfmR": 5,
      "rfmF": 4,
      "rfmM": 5,
      "rfmSegment": "CHAMPIONS",
      "totalOrders": 12,
      "totalSpend": 48500,
      "lastOrderAt": "2025-04-10T00:00:00.000Z",
      "createdAt": "2025-01-15T08:00:00.000Z",
      "updatedAt": "2025-04-10T00:05:00.000Z"
    }
  ],
  "pagination": {
    "hasMore": true,
    "nextCursor": "eyJfaWQiOiI2NjRhMWIyYzNkNGU1ZjY3ODlhYmNkZWYifQ==",
    "total": 1000
  }
}
```

### 4.2 Get Customer

```
GET /customers/:customerId
```

**Response 200:**

```json
{
  "data": {
    "_id": "664a1b2c3d4e5f6789abcdef",
    "brandId": "664a000000000000000000001",
    "phone": "+919876543210",
    "name": "Priya Sharma",
    "email": "priya.sharma@example.com",
    "source": "IMPORT",
    "tags": ["vip", "ethnic-wear"],
    "optOutChannels": [],
    "rfmR": 5,
    "rfmF": 4,
    "rfmM": 5,
    "rfmSegment": "CHAMPIONS",
    "totalOrders": 12,
    "totalSpend": 48500,
    "lastOrderAt": "2025-04-10T00:00:00.000Z",
    "createdAt": "2025-01-15T08:00:00.000Z",
    "updatedAt": "2025-04-10T00:05:00.000Z"
  }
}
```

**Response 404:**

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Customer 664a1b2c3d4e5f6789abcdef not found."
  }
}
```

### 4.3 Get Customer Communication History

```
GET /customers/:customerId/communications
```

Returns all `communication_events` for this customer, newest first.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | integer | Default: 20. Max: 100. |
| `cursor` | string | Pagination cursor. |
| `campaignId` | string | Filter by campaign. |

**Response 200:**

```json
{
  "data": [
    {
      "_id": "664e1b2c3d4e5f6789000001",
      "messageId": "664d1b2c3d4e5f6789001234",
      "campaignId": "664c1b2c3d4e5f6789000099",
      "channel": "WHATSAPP",
      "eventType": "DELIVERED",
      "eventTimestamp": "2025-04-15T10:35:00.000Z"
    }
  ],
  "pagination": {
    "hasMore": false,
    "nextCursor": null,
    "total": 4
  }
}
```

### 4.4 Update Customer Opt-Out

```
PATCH /customers/:customerId/opt-out
```

Used to record channel opt-outs from inbound user requests or manual CRM updates.

**Request Body:**

```json
{
  "channel": "WHATSAPP",
  "optedOut": true
}
```

**Validation:**
- `channel`: required, enum `["WHATSAPP", "EMAIL", "SMS"]`
- `optedOut`: required, boolean

**Response 200:**

```json
{
  "data": {
    "_id": "664a1b2c3d4e5f6789abcdef",
    "optOutChannels": ["WHATSAPP"],
    "updatedAt": "2025-04-20T09:00:00.000Z"
  }
}
```

---

## 5. Orders

### 5.1 List Orders

```
GET /orders
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | integer | Default: 20. Max: 200. |
| `cursor` | string | Pagination cursor. |
| `customerId` | string | Filter by customer ObjectId. |
| `channel` | string | Filter by order channel. |
| `startDate` | ISO 8601 | Orders on or after this date. |
| `endDate` | ISO 8601 | Orders on or before this date. |

**Response 200:**

```json
{
  "data": [
    {
      "_id": "664b1c2d3e4f5a6789abcde1",
      "brandId": "664a000000000000000000001",
      "orderId": "ORD-2025-00142",
      "customerId": "664a1b2c3d4e5f6789abcdef",
      "customerPhone": "+919876543210",
      "amount": 4250,
      "productCategory": "Sarees",
      "orderDate": "2025-04-10T00:00:00.000Z",
      "channel": "OFFLINE",
      "discountApplied": false,
      "campaignAttributedTo": null,
      "createdAt": "2025-04-10T08:15:00.000Z"
    }
  ],
  "pagination": {
    "hasMore": true,
    "nextCursor": "eyJfaWQiOiI2NjRiMWMyZDNlNGY1YTY3ODlhYmNkZTEifQ==",
    "total": 3000
  }
}
```

### 5.2 Get Order

```
GET /orders/:orderId
```

`orderId` is the MongoDB `_id` (hex string), not the external `orderId` field.

**Response 200:** Single order object (same shape as list item).

---

## 6. Import Jobs

### 6.1 Create Import Job

Accepts a CSV upload of customers and/or orders. After import completes, the server triggers a full RFM recompute.

```
POST /import
```

**Request:** `multipart/form-data`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | File | Yes | CSV file. Max size: 10 MB. |
| `type` | string | Yes | `"CUSTOMERS"` or `"ORDERS"` |

**CSV format for `CUSTOMERS`:**

```
phone,name,email,tags
+919876543210,Priya Sharma,priya@example.com,"vip,ethnic-wear"
```

**CSV format for `ORDERS`:**

```
phone,orderId,amount,productCategory,orderDate,channel,discountApplied
+919876543210,ORD-001,4250,Sarees,2025-04-10,OFFLINE,false
```

**Validation:**
- File must be `text/csv` or `application/vnd.ms-excel`.
- `type` must be `"CUSTOMERS"` or `"ORDERS"`.
- Phone numbers normalized to E.164 (`+91XXXXXXXXXX`) during import.

**Response 202 (Accepted):**

```json
{
  "data": {
    "_id": "664f1b2c3d4e5f6789000001",
    "status": "QUEUED",
    "type": "CUSTOMERS",
    "fileName": "customers_april.csv",
    "totalRows": 0,
    "processedRows": 0,
    "failedRows": 0,
    "createdAt": "2025-04-20T10:00:00.000Z"
  }
}
```

### 6.2 Get Import Job Status

```
GET /import/:jobId
```

Poll this endpoint after creating an import job. Import is complete when `status` is `COMPLETED` or `FAILED`.

**Response 200:**

```json
{
  "data": {
    "_id": "664f1b2c3d4e5f6789000001",
    "status": "COMPLETED",
    "type": "CUSTOMERS",
    "fileName": "customers_april.csv",
    "totalRows": 1000,
    "processedRows": 995,
    "failedRows": 5,
    "errors": [
      { "row": 47, "reason": "Invalid phone number: '98765'. Must be E.164 format." },
      { "row": 203, "reason": "Duplicate phone number: '+919876543210' already exists." }
    ],
    "rfmRecomputeTriggered": true,
    "rfmRecomputeStatus": "COMPLETED",
    "completedAt": "2025-04-20T10:00:42.000Z",
    "createdAt": "2025-04-20T10:00:00.000Z"
  }
}
```

**`status` values:** `QUEUED` → `PROCESSING` → `COMPLETED` | `FAILED`

**`rfmRecomputeStatus` values:** `PENDING` → `RUNNING` → `COMPLETED` | `FAILED`

### 6.3 List Import Jobs

```
GET /import
```

**Query Parameters:** `limit`, `cursor`, `status`, `type`

**Response 200:** Paginated list of import job objects.

---

## 7. Segments & RFM

### 7.1 Get RFM Segment Summary

Returns customer counts and aggregate stats per RFM segment. Used to populate the Audience Overview dashboard.

```
GET /segments
```

**Response 200:**

```json
{
  "data": {
    "computedAt": "2025-04-20T10:00:42.000Z",
    "totalCustomers": 1000,
    "segments": [
      {
        "segment": "CHAMPIONS",
        "count": 127,
        "percentOfTotal": 12.7,
        "avgSpend": 52400,
        "avgOrderFrequency": 10.2,
        "avgDaysSinceLastOrder": 18
      },
      {
        "segment": "PROMISING",
        "count": 183,
        "percentOfTotal": 18.3,
        "avgSpend": 18200,
        "avgOrderFrequency": 4.1,
        "avgDaysSinceLastOrder": 45
      },
      {
        "segment": "AT_RISK_LOYALISTS",
        "count": 95,
        "percentOfTotal": 9.5,
        "avgSpend": 38700,
        "avgOrderFrequency": 8.8,
        "avgDaysSinceLastOrder": 72
      },
      {
        "segment": "DORMANT_VIPS",
        "count": 61,
        "percentOfTotal": 6.1,
        "avgSpend": 45100,
        "avgOrderFrequency": 6.3,
        "avgDaysSinceLastOrder": 142
      },
      {
        "segment": "LAPSED_LOW_VALUE",
        "count": 289,
        "percentOfTotal": 28.9,
        "avgSpend": 4800,
        "avgOrderFrequency": 1.2,
        "avgDaysSinceLastOrder": 210
      },
      {
        "segment": "GENERAL",
        "count": 245,
        "percentOfTotal": 24.5,
        "avgSpend": 9200,
        "avgOrderFrequency": 2.4,
        "avgDaysSinceLastOrder": 88
      }
    ]
  }
}
```

### 7.2 Get Customers in Segment

```
GET /segments/:segmentName/customers
```

`segmentName` is one of: `CHAMPIONS`, `PROMISING`, `AT_RISK_LOYALISTS`, `DORMANT_VIPS`, `LAPSED_LOW_VALUE`, `GENERAL`

**Query Parameters:** `limit`, `cursor`

**Response 200:** Paginated customer list (same shape as §4.1).

**Response 404 (invalid segment name):**

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Segment 'INVALID_SEGMENT' does not exist. Valid segments: CHAMPIONS, PROMISING, AT_RISK_LOYALISTS, DORMANT_VIPS, LAPSED_LOW_VALUE, GENERAL"
  }
}
```

---

## 8. Campaigns — Core CRUD

### 8.1 List Campaigns

```
GET /campaigns
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | integer | Default: 20. Max: 100. |
| `cursor` | string | Pagination cursor. |
| `status` | string | Filter by campaign status. |

**Response 200:**

```json
{
  "data": [
    {
      "_id": "664c1b2c3d4e5f6789000099",
      "name": "Diwali Win-Back April 2025",
      "goalText": "Win back customers who haven't purchased in 90 days",
      "goalType": "WIN_BACK",
      "status": "ACTIVE",
      "totalRecipients": 183,
      "scheduledAt": "2025-04-15T09:00:00.000Z",
      "launchedAt": "2025-04-15T09:02:14.000Z",
      "createdAt": "2025-04-14T16:30:00.000Z"
    }
  ],
  "pagination": {
    "hasMore": false,
    "nextCursor": null,
    "total": 3
  }
}
```

### 8.2 Get Campaign

```
GET /campaigns/:campaignId
```

Returns the full campaign document including `audienceSnapshot`, `revenueEstimate`, and `aiReport` (if generated).

**Response 200:**

```json
{
  "data": {
    "_id": "664c1b2c3d4e5f6789000099",
    "brandId": "664a000000000000000000001",
    "name": "Diwali Win-Back April 2025",
    "goalText": "Win back customers who haven't purchased in 90 days",
    "goalType": "WIN_BACK",
    "status": "ACTIVE",
    "intentType": "WIN_BACK_DORMANT",
    "intentParameters": {
      "dormancyDays": 90
    },
    "audienceFilter": {
      "rfmSegment": { "$in": ["DORMANT_VIPS", "LAPSED_LOW_VALUE"] },
      "daysSinceLastOrder": { "$gte": 90 }
    },
    "audienceSnapshot": {
      "count": 183,
      "medianAOV": 3800,
      "channelMix": {
        "WHATSAPP": 142,
        "EMAIL": 41
      },
      "savedAt": "2025-04-14T16:35:00.000Z"
    },
    "totalRecipients": 183,
    "scheduledAt": "2025-04-15T09:00:00.000Z",
    "launchedAt": "2025-04-15T09:02:14.000Z",
    "completedAt": null,
    "revenueEstimate": {
      "min": 52400,
      "max": 73600,
      "conversionRate": 0.05,
      "source": "BENCHMARK_KLAVIYO_2024"
    },
    "aiReport": null,
    "aiReportGeneratedAt": null,
    "createdAt": "2025-04-14T16:30:00.000Z",
    "draftSavedAt": "2025-04-14T16:35:00.000Z"
  }
}
```

### 8.3 Delete Campaign

Only campaigns in `DRAFT` status can be deleted.

```
DELETE /campaigns/:campaignId
```

**Response 200:**

```json
{
  "data": {
    "_id": "664c1b2c3d4e5f6789000099",
    "deleted": true
  }
}
```

**Response 422 (not in DRAFT):**

```json
{
  "error": {
    "code": "UNPROCESSABLE",
    "message": "Campaign cannot be deleted in status ACTIVE. Only DRAFT campaigns can be deleted."
  }
}
```

---

## 9. Campaigns — AI Pipeline

This section describes the 5-call Gemini pipeline that powers campaign creation. Each step maps to a distinct API endpoint. The frontend drives the multi-step flow by calling these endpoints in sequence after user gate confirmations.

### Pipeline Overview

```
POST /campaigns/intent-extract          → Call 1: Intent Extraction (gemini-1.5-flash)
     ↓ [Gate 1: User confirms intent]
POST /campaigns/:id/audience-preview    → Calls 2+3: Audience Narrative + Message Gen (parallel)
     ↓ [Gate 2: User reviews audience]
     → Campaign saved as DRAFT
POST /campaigns/:id/refine              → Call 4: Critique + Refinement (gemini-1.5-flash)
POST /campaigns/:id/launch              → Enqueues dispatch jobs (no LLM call here)
     ↓ [T+48h background job]
     → Call 5: Post-Campaign Report (gemini-1.5-pro, async)
```

---

### 9.1 Extract Intent (Call 1)

```
POST /campaigns/intent-extract
```

Takes the user's natural-language goal. Returns structured intent + a plain-English confirmation text for Gate 1.

**Request Body:**

```json
{
  "goalText": "Win back customers who haven't purchased in 90 days"
}
```

**Validation:**
- `goalText`: required, string, 10–500 characters.

**Response 200:**

```json
{
  "data": {
    "intentType": "WIN_BACK_DORMANT",
    "intentParameters": {
      "dormancyDays": 90
    },
    "confirmationText": "I'll target customers who haven't purchased in the last 90 days. This typically includes your Dormant VIP and Lapsed Low-Value segments. Does this match what you had in mind?",
    "suggestedName": "Win-Back Campaign — 90 Day Dormant",
    "aiLogId": "664e0000000000000000aa01"
  }
}
```

**Response 400 (goal too ambiguous):**

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Goal is too short or ambiguous. Please describe your campaign goal in at least 10 characters.",
    "field": "goalText"
  }
}
```

**Response 502 (Gemini failure):**

```json
{
  "error": {
    "code": "AI_UNAVAILABLE",
    "message": "The AI model is temporarily unavailable. Please try again in a few seconds.",
    "details": {
      "retryAfterMs": 3000
    }
  }
}
```

**Supported `intentType` values and their `intentParameters`:**

| `intentType` | Parameters |
|---|---|
| `WIN_BACK_DORMANT` | `dormancyDays: number` |
| `REWARD_TOP_SPENDERS` | `topPercentile: number` |
| `RE_ENGAGE_SINGLE_PURCHASE` | *(none)* |
| `UPSELL_CATEGORY` | `category: string` |
| `VIP_LOYALTY` | `minOrderCount: number`, `minTotalSpend: number` |

---

### 9.2 Preview Audience + Generate Messages (Calls 2 & 3)

```
POST /campaigns/:campaignId/audience-preview
```

This is the **heaviest** endpoint. It:
1. Creates the campaign document in `DRAFT` status (or updates if `campaignId` already exists).
2. Translates `intentType + intentParameters` → MongoDB filter via the CRM Service whitelist.
3. Runs the MongoDB audience query.
4. Calls Gemini in **parallel**: Call 2 (Audience Narrative, gemini-1.5-flash) + Call 3 (Message Generation, gemini-1.5-pro).
5. Saves `campaign_clusters` with generated messages.
6. Returns a streaming-friendly response (see note below).

**Request Body:**

```json
{
  "goalText": "Win back customers who haven't purchased in 90 days",
  "intentType": "WIN_BACK_DORMANT",
  "intentParameters": {
    "dormancyDays": 90
  },
  "suggestedName": "Win-Back Campaign — 90 Day Dormant"
}
```

**Validation:**
- `goalText`: required, string.
- `intentType`: required, must be a known intent type from the whitelist.
- `intentParameters`: required, object. Validated against the whitelist for the given intent type.
- `suggestedName`: optional, string, max 120 characters.

**Response 200:**

> **Note on progressive rendering:** The frontend should start rendering the `audience` block as soon as it arrives (Call 2 returns first, ~3s). Message clusters (`clusters`) show skeleton loaders until the full response arrives (~5s total). Both are returned in a single JSON response body — the frontend does not need SSE or WebSocket for this endpoint.

```json
{
  "data": {
    "campaignId": "664c1b2c3d4e5f6789000099",
    "status": "DRAFT",
    "audience": {
      "count": 183,
      "medianAOV": 3800,
      "channelMix": {
        "WHATSAPP": 142,
        "EMAIL": 41
      },
      "narrative": "183 customers haven't visited in 90+ days. This group includes 61 Dormant VIPs — historically your highest spenders — averaging ₹4,100 per order. WhatsApp reaches 78% of this audience. A modest 5% win-back rate would recover ₹37,500 in revenue.",
      "clusterCards": [
        {
          "clusterId": "664c2b2c3d4e5f6789000001",
          "label": "Dormant VIPs",
          "count": 61,
          "rfmSegment": "DORMANT_VIPS",
          "avgSpend": 45100,
          "channels": { "WHATSAPP": 48, "EMAIL": 13 }
        },
        {
          "clusterId": "664c2b2c3d4e5f6789000002",
          "label": "Lapsed Customers",
          "count": 122,
          "rfmSegment": "LAPSED_LOW_VALUE",
          "avgSpend": 4800,
          "channels": { "WHATSAPP": 94, "EMAIL": 28 }
        }
      ]
    },
    "clusters": [
      {
        "clusterId": "664c2b2c3d4e5f6789000001",
        "label": "Dormant VIPs",
        "whatsappMessage": {
          "body": "Hi {name}, we miss you at Raga! It's been a while since your last visit. As one of our valued customers, enjoy 15% off your next purchase. Use code WELCOMEBACK15. Shop now: {ctaUrl}",
          "ctaUrl": "https://raga.store/collections/new",
          "subject": null
        },
        "emailMessage": {
          "subject": "We miss you, {name} — here's something special",
          "body": "Dear {name},\n\nIt's been a while since we've seen you at Raga, and we'd love to have you back...",
          "ctaUrl": "https://raga.store/collections/new"
        }
      },
      {
        "clusterId": "664c2b2c3d4e5f6789000002",
        "label": "Lapsed Customers",
        "whatsappMessage": {
          "body": "Hi {name}! Raga has new arrivals you'll love. Come back and discover what's new. Shop now: {ctaUrl}",
          "ctaUrl": "https://raga.store/collections/new",
          "subject": null
        },
        "emailMessage": {
          "subject": "New arrivals at Raga — you might love these",
          "body": "Hi {name},\n\nWe have exciting new collections you haven't seen yet...",
          "ctaUrl": "https://raga.store/collections/new"
        }
      }
    ],
    "revenueEstimate": {
      "min": 52400,
      "max": 73600,
      "conversionRate": 0.05,
      "source": "BENCHMARK_KLAVIYO_2024"
    },
    "aiLogId": "664e0000000000000000aa02",
    "draftSavedAt": "2025-04-14T16:35:00.000Z"
  }
}
```

**Response 422 (unknown intent type):**

```json
{
  "error": {
    "code": "UNPROCESSABLE",
    "message": "Intent type 'UNKNOWN_INTENT' is not supported. The AI extracted an intent that has no corresponding audience query in the CRM whitelist.",
    "details": {
      "intentType": "UNKNOWN_INTENT",
      "supportedIntents": ["WIN_BACK_DORMANT", "REWARD_TOP_SPENDERS", "RE_ENGAGE_SINGLE_PURCHASE", "UPSELL_CATEGORY", "VIP_LOYALTY"]
    }
  }
}
```

---

### 9.3 Refine Messages (Call 4)

```
POST /campaigns/:campaignId/refine
```

Applies AI critique to the generated messages. Returns refined messages (or confirms no changes needed). Requires campaign to be in `DRAFT` status.

**Request Body:**

```json
{
  "userFeedback": "Make the tone warmer and mention our Diwali collection"
}
```

**Validation:**
- `userFeedback`: optional, string, max 500 characters. If omitted, runs auto-critique only.

**Response 200:**

```json
{
  "data": {
    "campaignId": "664c1b2c3d4e5f6789000099",
    "critiqueApplied": true,
    "critiqueNotes": "Added warmth and Diwali collection reference. Ensured {name} personalization present. WhatsApp message under 160 chars.",
    "clusters": [
      {
        "clusterId": "664c2b2c3d4e5f6789000001",
        "whatsappMessage": {
          "body": "Hi {name}, Diwali is around the corner and Raga's festive collection is here! We've missed you — come back for 15% off. Use DIWALI15: {ctaUrl}",
          "ctaUrl": "https://raga.store/collections/diwali",
          "subject": null
        },
        "emailMessage": {
          "subject": "Diwali is here, {name} — and so are new arrivals at Raga",
          "body": "Dear {name},\n\nThis Diwali, we're celebrating with our most vibrant collection yet...",
          "ctaUrl": "https://raga.store/collections/diwali"
        }
      }
    ],
    "aiLogId": "664e0000000000000000aa04"
  }
}
```

**Response 422 (campaign not in DRAFT):**

```json
{
  "error": {
    "code": "UNPROCESSABLE",
    "message": "Campaign must be in DRAFT status to refine messages. Current status: ACTIVE."
  }
}
```

---

### 9.4 Get Campaign AI Report (Call 5 — async)

```
GET /campaigns/:campaignId/report
```

Returns the post-campaign AI report. Only available when `status` is `COMPLETED` and `aiReport` is populated (typically T+48h after campaign completion).

**Response 200 (report ready):**

```json
{
  "data": {
    "campaignId": "664c1b2c3d4e5f6789000099",
    "reportReady": true,
    "aiReport": {
      "summary": "The win-back campaign achieved a 6.5% conversion rate, exceeding the 5% benchmark by 30%. WhatsApp outperformed email 7.2% vs 4.1% conversion.",
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
        "WHATSAPP": {
          "sent": 142,
          "converted": 10,
          "conversionRate": 7.0
        },
        "EMAIL": {
          "sent": 41,
          "converted": 2,
          "conversionRate": 4.9
        }
      },
      "aiInsights": "The Dormant VIP cluster drove 83% of conversions despite being 33% of the audience. Future win-back campaigns should prioritize this segment. Consider a higher discount (20%) to improve the Lapsed Low-Value conversion rate.",
      "generatedAt": "2025-04-17T10:15:00.000Z"
    },
    "aiLogId": "664e0000000000000000aa05"
  }
}
```

**Response 200 (report not ready):**

```json
{
  "data": {
    "campaignId": "664c1b2c3d4e5f6789000099",
    "reportReady": false,
    "aiReport": null,
    "estimatedReadyAt": "2025-04-17T09:02:00.000Z"
  }
}
```

---

## 10. Campaigns — Launch & Lifecycle

### 10.1 Mark Campaign Ready for Review

```
POST /campaigns/:campaignId/ready
```

Transitions campaign from `DRAFT` → `READY_FOR_REVIEW`. Called after Gate 2 (user confirms audience).

**Request Body:** *(empty)*

**Response 200:**

```json
{
  "data": {
    "campaignId": "664c1b2c3d4e5f6789000099",
    "status": "READY_FOR_REVIEW",
    "updatedAt": "2025-04-14T16:40:00.000Z"
  }
}
```

**Response 422 (invalid transition):**

```json
{
  "error": {
    "code": "UNPROCESSABLE",
    "message": "Invalid status transition: ACTIVE → READY_FOR_REVIEW."
  }
}
```

### 10.2 Launch Campaign

```
POST /campaigns/:campaignId/launch
```

Transitions `READY_FOR_REVIEW` → `LAUNCHING` → `ACTIVE`. Enqueues one `dispatch_job` per customer per channel.

**Request Body:**

```json
{
  "scheduledAt": "2025-04-15T09:00:00.000Z"
}
```

**Validation:**
- `scheduledAt`: optional ISO 8601 UTC datetime. If omitted, launches immediately. Must be in the future if provided.

**Response 200:**

```json
{
  "data": {
    "campaignId": "664c1b2c3d4e5f6789000099",
    "status": "ACTIVE",
    "totalRecipients": 183,
    "dispatchJobsCreated": 183,
    "scheduledAt": "2025-04-15T09:00:00.000Z",
    "launchedAt": "2025-04-14T16:45:00.000Z"
  }
}
```

**Response 422 (not in READY_FOR_REVIEW):**

```json
{
  "error": {
    "code": "UNPROCESSABLE",
    "message": "Campaign must be in READY_FOR_REVIEW status to launch. Current status: DRAFT."
  }
}
```

**Response 422 (no audience):**

```json
{
  "error": {
    "code": "UNPROCESSABLE",
    "message": "Campaign has 0 recipients. Cannot launch an empty campaign."
  }
}
```

### 10.3 Get Campaign Performance Summary

```
GET /campaigns/:campaignId/performance
```

Real-time delivery + engagement stats aggregated from `communication_events`. Available for `ACTIVE` and `COMPLETED` campaigns.

**Response 200:**

```json
{
  "data": {
    "campaignId": "664c1b2c3d4e5f6789000099",
    "status": "ACTIVE",
    "totalRecipients": 183,
    "stats": {
      "SENT": 183,
      "DELIVERED": 178,
      "FAILED": 5,
      "OPENED": 124,
      "READ": 118,
      "CLICKED": 67,
      "CONVERTED": 12,
      "OPT_OUT": 2
    },
    "rates": {
      "deliveryRate": 97.3,
      "openRate": 69.7,
      "clickRate": 37.6,
      "conversionRate": 6.5
    },
    "revenueAttributed": 49200,
    "lastUpdatedAt": "2025-04-15T14:30:00.000Z"
  }
}
```

### 10.4 Get Campaign Messages

```
GET /campaigns/:campaignId/messages
```

Returns all `campaign_messages` for the campaign with their latest delivery status.

**Query Parameters:** `limit`, `cursor`, `status`, `channel`

**Response 200:**

```json
{
  "data": [
    {
      "_id": "664d1b2c3d4e5f6789001234",
      "customerId": "664a1b2c3d4e5f6789abcdef",
      "customerName": "Priya Sharma",
      "customerPhone": "+919876543210",
      "clusterId": "664c2b2c3d4e5f6789000001",
      "channel": "WHATSAPP",
      "status": "DELIVERED",
      "sentAt": "2025-04-15T09:02:30.000Z",
      "deliveredAt": "2025-04-15T09:02:45.000Z",
      "openedAt": null,
      "clickedAt": null,
      "convertedAt": null
    }
  ],
  "pagination": {
    "hasMore": true,
    "nextCursor": "eyJfaWQiOiI2NjRkMWIyYzNkNGU1ZjY3ODkwMDEyMzQifQ==",
    "total": 183
  }
}
```

---

## 11. Analytics

### 11.1 Get Dashboard Summary

```
GET /analytics/dashboard
```

Returns high-level CRM metrics for the main dashboard.

**Response 200:**

```json
{
  "data": {
    "customers": {
      "total": 1000,
      "newLast30Days": 42,
      "activeChannels": {
        "WHATSAPP": 782,
        "EMAIL": 651,
        "SMS": 290
      }
    },
    "orders": {
      "totalLast30Days": 312,
      "revenueLast30Days": 1284000,
      "avgOrderValue": 4115
    },
    "campaigns": {
      "total": 3,
      "active": 1,
      "completedLast30Days": 2,
      "avgConversionRate": 5.8
    },
    "rfmDistribution": {
      "CHAMPIONS": 127,
      "PROMISING": 183,
      "AT_RISK_LOYALISTS": 95,
      "DORMANT_VIPS": 61,
      "LAPSED_LOW_VALUE": 289,
      "GENERAL": 245
    },
    "computedAt": "2025-04-20T10:00:42.000Z"
  }
}
```

### 11.2 Get Revenue Attribution

```
GET /analytics/revenue
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `startDate` | ISO 8601 | Start of date range. |
| `endDate` | ISO 8601 | End of date range. |
| `campaignId` | string | Filter by specific campaign. |

**Response 200:**

```json
{
  "data": {
    "period": {
      "start": "2025-04-01T00:00:00.000Z",
      "end": "2025-04-30T23:59:59.000Z"
    },
    "totalRevenue": 4280000,
    "campaignAttributedRevenue": 98400,
    "campaignAttributionRate": 2.3,
    "campaignBreakdown": [
      {
        "campaignId": "664c1b2c3d4e5f6789000099",
        "campaignName": "Diwali Win-Back April 2025",
        "attributedRevenue": 49200,
        "conversions": 12
      }
    ]
  }
}
```

### 11.3 Get Channel Stats

```
GET /analytics/channel-stats
```

Returns historical send/open/click rates per channel per campaign type from `channel_stats` collection. Used for revenue estimate benchmarks when campaign history exists.

**Response 200:**

```json
{
  "data": [
    {
      "channel": "WHATSAPP",
      "campaignType": "WIN_BACK",
      "totalSent": 325,
      "totalDelivered": 318,
      "totalOpened": 221,
      "totalClicked": 98,
      "totalConverted": 19,
      "avgOpenRate": 69.5,
      "avgClickRate": 30.8,
      "avgConversionRate": 5.8,
      "lastUpdatedAt": "2025-04-17T10:15:00.000Z"
    },
    {
      "channel": "EMAIL",
      "campaignType": "WIN_BACK",
      "totalSent": 82,
      "totalDelivered": 80,
      "totalOpened": 18,
      "totalClicked": 7,
      "totalConverted": 3,
      "avgOpenRate": 22.5,
      "avgClickRate": 9.4,
      "avgConversionRate": 3.8,
      "lastUpdatedAt": "2025-04-17T10:15:00.000Z"
    }
  ]
}
```

---

## 12. AI Logs

### 12.1 List AI Logs for Campaign

```
GET /campaigns/:campaignId/ai-logs
```

Returns all Gemini call logs for this campaign in chronological order.

**Response 200:**

```json
{
  "data": [
    {
      "_id": "664e0000000000000000aa01",
      "callNumber": 1,
      "callName": "INTENT_EXTRACTION",
      "model": "gemini-1.5-flash",
      "inputTokens": 312,
      "outputTokens": 87,
      "latencyMs": 1240,
      "status": "SUCCESS",
      "createdAt": "2025-04-14T16:30:00.000Z"
    },
    {
      "_id": "664e0000000000000000aa02",
      "callNumber": 2,
      "callName": "AUDIENCE_NARRATIVE",
      "model": "gemini-1.5-flash",
      "inputTokens": 580,
      "outputTokens": 210,
      "latencyMs": 2180,
      "status": "SUCCESS",
      "createdAt": "2025-04-14T16:35:00.000Z"
    },
    {
      "_id": "664e0000000000000000aa03",
      "callNumber": 3,
      "callName": "MESSAGE_GENERATION",
      "model": "gemini-1.5-pro",
      "inputTokens": 1240,
      "outputTokens": 680,
      "latencyMs": 4320,
      "status": "SUCCESS",
      "createdAt": "2025-04-14T16:35:00.000Z"
    }
  ]
}
```

---

## 13. Channel Service — Dispatch

The Channel Service is a separate Express application. It polls `dispatch_jobs` every 2 seconds and processes jobs. This section documents the endpoints it exposes internally.

> **Note:** These endpoints are called by the CRM Service only. They are not exposed to the frontend. The Channel Service URL is set in CRM Service environment variables as `CHANNEL_SERVICE_URL`.

### 13.1 Health

```
GET /health
```

**Response 200:** See §16.

### 13.2 Dispatch Single Message (Internal)

> **V1 Architecture Note:** The Channel Service polls MongoDB directly rather than exposing a REST dispatch endpoint. This section documents the internal dispatch contract for documentation completeness. The Channel Service does NOT expose an HTTP endpoint for individual message dispatch in V1.

The Channel Service reads `dispatch_jobs` with `status: "QUEUED"` using atomic `findOneAndUpdate`:

```javascript
db.dispatch_jobs.findOneAndUpdate(
  { status: "QUEUED", brandId: <brandId> },
  {
    $set: {
      status: "PROCESSING",
      lastAttemptedAt: new Date()
    },
    $inc: { attempts: 1 }
  },
  { sort: { createdAt: 1 }, returnDocument: "after" }
)
```

After processing, it POSTs a signed callback to the CRM Service (§14).

---

## 14. Channel Service — Callbacks

The Channel Service POSTs delivery status updates back to the CRM Service. These are HMAC-SHA256 signed to prevent spoofing.

### 14.1 Receive Callback (CRM Service endpoint)

```
POST /callbacks/delivery
```

> **Note:** This endpoint is called by the Channel Service, not the frontend. It does not require a Bearer token — it uses HMAC-SHA256 signature validation instead.

**HMAC Validation:**

1. Channel Service signs the raw request body with the campaign's `hmacSecret` using HMAC-SHA256.
2. Signature is sent in the `X-Xeno-Signature` header as `sha256=<hex_digest>`.
3. CRM Service looks up `hmacSecret` by `campaignId` from the payload.
4. CRM Service recomputes the HMAC and compares using `crypto.timingSafeEqual()`.
5. If signatures do not match: respond `401` and log the attempt.

**Request Headers:**

```
Content-Type: application/json
X-Xeno-Signature: sha256=a3f1e2b4c5d6...
```

**Request Body:**

```json
{
  "messageId": "664d1b2c3d4e5f6789001234",
  "campaignId": "664c1b2c3d4e5f6789000099",
  "customerId": "664a1b2c3d4e5f6789abcdef",
  "channel": "WHATSAPP",
  "eventType": "DELIVERED",
  "eventTimestamp": "2025-04-15T09:02:45.000Z",
  "providerMessageId": "wamid.HBgMOTE5ODc2NTQzMjEwFQIAERgSOTg3NjU0MzIxMDU0MzIxAA==",
  "metadata": {
    "provider": "MOCK_WHATSAPP"
  }
}
```

**Idempotency:**

The CRM Service computes `idempotencyKey = SHA256("{messageId}:{eventType}")` and inserts into `communication_events`. The unique index on `idempotencyKey` causes duplicate callbacks to fail with a MongoDB duplicate key error, which the CRM Service silently ignores (responds `200` to the Channel Service to prevent retries).

**Response 200 (accepted):**

```json
{
  "accepted": true
}
```

**Response 200 (duplicate — silently ignored):**

```json
{
  "accepted": false,
  "reason": "DUPLICATE_EVENT"
}
```

**Response 401 (invalid signature):**

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "HMAC signature validation failed."
  }
}
```

**Response 404 (campaign not found):**

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Campaign not found. Cannot validate HMAC secret."
  }
}
```

**Supported `eventType` values:** `SENT` | `DELIVERED` | `FAILED` | `OPENED` | `READ` | `CLICKED` | `CONVERTED` | `OPT_OUT`

---

## 15. Click Tracking

### 15.1 Track Click and Redirect

```
GET /track/click/:messageId
```

This endpoint is embedded as the CTA URL in every campaign message at dispatch time. When a customer taps the link:

1. The CRM Service looks up `campaign_messages` by `messageId` to get `ctaUrl` (single lookup — `ctaUrl` is denormalized).
2. A `CLICKED` callback event is recorded in `communication_events`.
3. The customer is immediately redirected to `ctaUrl` with a `302 Found`.

> **Note:** This endpoint does not require authentication — it is a public redirect URL sent to customers.

**Response 302 (success):**

```
HTTP/1.1 302 Found
Location: https://raga.store/collections/diwali
```

**Response 404 (message not found):**

```
HTTP/1.1 404 Not Found
```

Returns a minimal HTML page (not JSON) since this URL is opened in a browser:

```html
<html>
  <body>
    <p>This link is no longer available. Please visit <a href="https://raga.store">raga.store</a> directly.</p>
  </body>
</html>
```

**Response 410 (link expired — future):**

> V1 does not implement link expiry. All click tracking links are permanent.

---

## 16. Health Checks

Both the CRM Service and Channel Service expose a health endpoint used by Render for uptime checks.

### CRM Service Health

```
GET /health
```

**Response 200:**

```json
{
  "status": "ok",
  "service": "xeno-copilot-crm",
  "timestamp": "2025-04-20T10:00:00.000Z",
  "version": "1.0.0",
  "checks": {
    "mongodb": "ok",
    "gemini": "ok"
  }
}
```

**Response 503 (degraded):**

```json
{
  "status": "degraded",
  "service": "xeno-copilot-crm",
  "timestamp": "2025-04-20T10:00:00.000Z",
  "checks": {
    "mongodb": "ok",
    "gemini": "error"
  }
}
```

### Channel Service Health

```
GET /health
```

**Response 200:**

```json
{
  "status": "ok",
  "service": "xeno-copilot-channel",
  "timestamp": "2025-04-20T10:00:00.000Z",
  "version": "1.0.0",
  "checks": {
    "mongodb": "ok",
    "dispatchQueueDepth": 0
  }
}
```

---

## 17. Webhook Event Reference

### Campaign Status Transitions

Triggered internally when campaign status changes. Not a public webhook in V1 but documented for implementation reference.

| From | To | Trigger |
|------|----|---------|
| *(new)* | `DRAFT` | `POST /campaigns/:id/audience-preview` completes |
| `DRAFT` | `READY_FOR_REVIEW` | `POST /campaigns/:id/ready` |
| `READY_FOR_REVIEW` | `LAUNCHING` | `POST /campaigns/:id/launch` |
| `LAUNCHING` | `ACTIVE` | All `dispatch_jobs` created successfully |
| `ACTIVE` | `COMPLETED` | All `dispatch_jobs` reach terminal status (`DONE` or `FAILED`) |
| Any | `FAILED` | Unrecoverable error during launch or dispatch |

### Communication Event Funnel

Events are recorded in order. Not all events occur for every message.

```
SENT → DELIVERED → OPENED → READ → CLICKED → CONVERTED
                 ↘ FAILED
                 ↘ OPT_OUT (at any point after SENT)
```

| Event | Triggered by | Notes |
|-------|-------------|-------|
| `SENT` | Channel Service | Message handed to provider. |
| `DELIVERED` | Provider callback (mocked in V1) | Confirmed delivery to device. |
| `FAILED` | Provider callback or 3-retry exhaustion | Terminal. No retry after 3 attempts. |
| `OPENED` | Provider callback (email open pixel) | WhatsApp: not supported by mock. |
| `READ` | WhatsApp read receipt | Email: not applicable. |
| `CLICKED` | CRM `/track/click/:messageId` redirect | Channel-agnostic. |
| `CONVERTED` | Background attribution job (runs every 30 min) | Last-touch, 14-day window. |
| `OPT_OUT` | Provider callback or customer request | Sets `optOutChannels` on customer. |

---

*Document Status: Version 1.0 — Complete. Next: AI_FEATURES.md*
