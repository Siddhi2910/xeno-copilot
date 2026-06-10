# Deployment

**Version:** 1.0  
**Stack:** MongoDB Atlas M0 · Render Starter (×2) · Vercel (Hobby) · Gemini API  
**Total monthly cost:** ~$14/mo (2× Render Starter at $7/mo; everything else free tier)

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Prerequisites](#2-prerequisites)
3. [MongoDB Atlas Setup](#3-mongodb-atlas-setup)
4. [Gemini API Setup](#4-gemini-api-setup)
5. [SendGrid Setup](#5-sendgrid-setup)
6. [CRM Service — Render Deployment](#6-crm-service--render-deployment)
7. [Channel Service — Render Deployment](#7-channel-service--render-deployment)
8. [Frontend — Vercel Deployment](#8-frontend--vercel-deployment)
9. [Environment Variables Reference](#9-environment-variables-reference)
10. [Seed Data Loading](#10-seed-data-loading)
11. [Health Checks](#11-health-checks)
12. [Monitoring](#12-monitoring)
13. [Demo Day Checklist](#13-demo-day-checklist)
14. [Failure Recovery Checklist](#14-failure-recovery-checklist)
15. [Production Readiness Checklist](#15-production-readiness-checklist)

---

## 1. Architecture Overview

```
Browser (Vercel)
      │
      │  HTTPS + Bearer token
      ▼
CRM Service (Render Starter)          ←── Gemini API (Google Cloud)
      │                                
      │  MongoDB connection (shared)
      ▼
MongoDB Atlas M0 (shared cluster)
      ▲
      │  MongoDB connection (shared)
Channel Service (Render Starter)
      │
      │  HMAC-signed POST /callbacks/delivery
      └─────────────────────────────────────→ CRM Service
```

**Three deployments. One database cluster. No Redis. No message broker.**

| Service | Platform | Plan | URL Pattern | Monthly Cost |
|---------|----------|------|-------------|-------------|
| `xeno-copilot-crm` | Render | Starter | `https://xeno-copilot-crm.onrender.com` | $7/mo |
| `xeno-copilot-channel` | Render | Starter | `https://xeno-copilot-channel.onrender.com` | $7/mo |
| `xeno-copilot-frontend` | Vercel | Hobby | `https://xeno-copilot.vercel.app` | Free |
| MongoDB | Atlas | M0 | `*.mongodb.net` | Free |
| Gemini API | Google Cloud | Pay-per-use | `generativelanguage.googleapis.com` | ~$0.011/campaign |
| SendGrid | Twilio | Free tier | `api.sendgrid.com` | Free (100 emails/day) |

**Why Render Starter over free tier:** Render's free tier spins down after 15 minutes of inactivity. A cold start takes 10–20 seconds. During a demo this is fatal. Render Starter ($7/mo) keeps the service always-on. This is an explicit engineering trade-off documented in ADR-007 of SYSTEM_ARCHITECTURE.md.

---

## 2. Prerequisites

Complete these before starting any deployment steps.

### Accounts to Create

| Service | URL | What You Need |
|---------|-----|---------------|
| MongoDB Atlas | cloud.mongodb.com | Free account |
| Google Cloud (Gemini) | aistudio.google.com | API key (free quota sufficient for demo) |
| Render | render.com | Free account (add card for Starter plan) |
| Vercel | vercel.com | Free account (connect GitHub) |
| SendGrid | sendgrid.com | Free account + sender verification |
| GitHub | github.com | Three repositories created |

### GitHub Repositories

Create three empty repositories before deploying anything. Render and Vercel deploy directly from GitHub, so the repositories must exist first.

```
github.com/<your-username>/xeno-copilot-crm
github.com/<your-username>/xeno-copilot-channel
github.com/<your-username>/xeno-copilot-frontend
```

Set all three to **private** for the internship submission. You will share the repo link with the Xeno team separately.

### Local Tools Required

```
node >= 18.0.0
npm >= 9.0.0
mongosh           (for verifying seed data)
git
curl              (for smoke testing endpoints)
```

Verify:
```bash
node --version    # must be >= 18
mongosh --version # any version
curl --version    # any version
```

---

## 3. MongoDB Atlas Setup

### Step 1: Create Organisation and Project

1. Log in to cloud.mongodb.com.
2. Create a new Organisation: `Xeno Copilot`.
3. Create a new Project: `xeno-copilot-demo`.

### Step 2: Deploy Free Cluster

1. Click **Build a Database**.
2. Select **M0 Free** tier.
3. Cloud Provider: **AWS**.
4. Region: **Mumbai (ap-south-1)** — closest to the demo audience (India-based retail use case). If Mumbai is unavailable, use **Singapore (ap-southeast-1)**.
5. Cluster name: `xeno-copilot-cluster`.
6. Click **Create**.

Wait 2–3 minutes for the cluster to provision.

### Step 3: Create Database User

1. Navigate to **Database Access** (left sidebar).
2. Click **Add New Database User**.
3. Authentication method: **Password**.
4. Username: `xeno-copilot-app`
5. Password: Generate a secure password (use the Atlas auto-generate button). **Copy this password immediately** — you cannot retrieve it later.
6. Database User Privileges: **Read and write to any database**.
7. Click **Add User**.

### Step 4: Configure Network Access

1. Navigate to **Network Access** (left sidebar).
2. Click **Add IP Address**.
3. Click **Allow Access from Anywhere** → this sets `0.0.0.0/0`.
4. Click **Confirm**.

**Security note:** `0.0.0.0/0` is acceptable for an internship demo. In production, you would whitelist only the Render service IP ranges. The database user credentials remain the primary security layer.

### Step 5: Get Connection String

1. Navigate to **Database** (left sidebar).
2. Click **Connect** on `xeno-copilot-cluster`.
3. Select **Connect your application**.
4. Driver: **Node.js**, Version: **5.5 or later**.
5. Copy the connection string. It will look like:
   ```
   mongodb+srv://xeno-copilot-app:<password>@xeno-copilot-cluster.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
6. Replace `<password>` with the password from Step 3.
7. Append the database name: add `xeno_copilot` before the `?`:
   ```
   mongodb+srv://xeno-copilot-app:<password>@xeno-copilot-cluster.xxxxx.mongodb.net/xeno_copilot?retryWrites=true&w=majority
   ```

**Save this connection string.** It is used in both the CRM Service and Channel Service environment variables as `MONGODB_URI`.

### Step 6: Verify Connection Locally

```bash
mongosh "mongodb+srv://xeno-copilot-app:<password>@xeno-copilot-cluster.xxxxx.mongodb.net/xeno_copilot"
```

Expected: `Atlas atlas-xxxxx-shard-0 [primary] xeno_copilot>`

Run:
```
show collections
```
Expected: empty (no collections yet — seed data loads later).

### Atlas M0 Limits (Know These)

| Limit | Value | Impact |
|-------|-------|--------|
| Storage | 512 MB | Demo dataset ~30 MB — safe |
| RAM | 512 MB shared | Adequate for demo queries |
| Connections | 500 | 2 services × 5 pool size = 10 — safe |
| No change streams | N/A | Architecture uses polling, not change streams |
| No VPC peering | N/A | IP whitelist covers this |

---

## 4. Gemini API Setup

### Step 1: Get API Key

1. Navigate to aistudio.google.com.
2. Sign in with a Google account.
3. Click **Get API key**.
4. Click **Create API key**.
5. Select **Create API key in new project**.
6. Copy the API key. It starts with `AIza`.

**Do not commit this key to GitHub.** It must only live in environment variables.

### Step 2: Verify Free Quota

Gemini API free tier (as of knowledge cutoff):
- Gemini 1.5 Flash: 15 requests/minute, 1,500 requests/day
- Gemini 1.5 Pro: 2 requests/minute, 50 requests/day

For a demo running fewer than 10 campaigns, the free tier is more than sufficient.

If you see `429 RESOURCE_EXHAUSTED` errors during development: wait 60 seconds and retry. The rate limit resets per minute. If you hit the daily limit on Pro (50 requests/day): this means you've run the message generation call 50+ times in one day — use cached responses for the remaining development work.

### Step 3: Test the Key

Before adding to any service, test the key returns a valid response:

```bash
curl -X POST \
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"contents":[{"parts":[{"text":"Return the JSON object: {\"status\": \"ok\"}"}]}]}'
```

Expected: HTTP 200 with a response containing `{"status": "ok"}` in the text field.

If you see `400 API_KEY_INVALID`: the key was not copied correctly. Regenerate it.  
If you see `403 PERMISSION_DENIED`: the Generative Language API is not enabled on the project. Enable it at console.cloud.google.com → APIs & Services → Enable APIs → search "Generative Language API".

---

## 5. SendGrid Setup

SendGrid is used for real email delivery. The Channel Service's mock email provider wraps the SendGrid API.

### Step 1: Create Account

1. Sign up at sendgrid.com.
2. Complete the account verification (email + phone).
3. Complete the "How will you use SendGrid?" form — select **Transactional Email**.

### Step 2: Create API Key

1. Navigate to **Settings → API Keys**.
2. Click **Create API Key**.
3. Name: `xeno-copilot-channel`
4. Permissions: **Restricted Access** → enable **Mail Send** only.
5. Click **Create & View**.
6. Copy the key (starts with `SG.`). This is shown only once.

### Step 3: Verify Sender Identity

SendGrid requires a verified sender address to send email.

1. Navigate to **Settings → Sender Authentication**.
2. Click **Verify a Single Sender** (quickest option).
3. Enter your email address as the "From" address.
4. Click **Create**.
5. Check your inbox for the verification email.
6. Click **Verify Single Sender** in the email.

The from address used in the demo will be this verified address. It appears as `Raga <your-verified-email>` in recipient inboxes.

### Step 4: Note Daily Limit

SendGrid free tier: **100 emails/day**. The demo campaign sends to ~41 email recipients. Well within the limit. Do not run the campaign more than twice on demo day without counting emails.

---

## 6. CRM Service — Render Deployment

### Step 1: Prepare the Repository

Ensure `xeno-copilot-crm` has the following in `package.json`:

```json
{
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "ts-node-dev --respawn src/index.ts"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

Ensure `tsconfig.json` outputs to `dist/`:
```json
{
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  }
}
```

Push all code to GitHub before proceeding.

### Step 2: Create Web Service on Render

1. Log in to render.com.
2. Click **New → Web Service**.
3. Connect your GitHub account if not already connected.
4. Select the `xeno-copilot-crm` repository.
5. Configure:

| Setting | Value |
|---------|-------|
| Name | `xeno-copilot-crm` |
| Region | **Singapore** (closest to Mumbai Atlas cluster) |
| Branch | `main` |
| Runtime | `Node` |
| Build Command | `npm install && npm run build` |
| Start Command | `npm run start` |
| Instance Type | **Starter ($7/mo)** |

6. Click **Create Web Service** (do NOT add environment variables yet).

Wait for the first build to run. It will fail (no env vars) — that is expected.

### Step 3: Add Environment Variables

After the service is created:

1. Go to the service → **Environment** tab.
2. Click **Add Environment Variable** for each variable below.

**Do not use the Render Secret Files feature** for this project — plain environment variables are simpler and sufficient for a demo.

| Variable | Value |
|----------|-------|
| `MONGODB_URI` | Full Atlas connection string with password |
| `GEMINI_API_KEY` | Your Gemini API key |
| `API_SECRET_TOKEN` | Generate: `openssl rand -hex 32` |
| `CHANNEL_SERVICE_URL` | `https://xeno-copilot-channel.onrender.com` |
| `DEMO_BRAND_ID` | Set after running seed script (see §10) |
| `PORT` | `3001` |
| `NODE_ENV` | `production` |
| `REPORT_MIN_HOURS_AFTER_COMPLETION` | `0` |
| `SENDGRID_FROM_EMAIL` | Your verified sender email address |
| `FRONTEND_URL` | `https://xeno-copilot.vercel.app` |

**Generate `API_SECRET_TOKEN`** locally:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Copy the output. Use the same value in the frontend's `NEXT_PUBLIC_API_SECRET_TOKEN`.

### Step 4: Trigger Manual Deploy

After adding all environment variables:
1. Go to **Manual Deploy → Deploy latest commit**.
2. Monitor the build logs.

Expected build output:
```
==> Running build command 'npm install && npm run build'...
==> Build successful
==> Starting service with 'npm run start'...
Server running on port 3001
Connected to MongoDB Atlas
```

### Step 5: Smoke Test

```bash
curl https://xeno-copilot-crm.onrender.com/health
```

Expected:
```json
{
  "status": "ok",
  "service": "xeno-copilot-crm",
  "checks": { "mongodb": "ok", "gemini": "ok" }
}
```

If `"mongodb": "error"`: double-check `MONGODB_URI` — ensure the password has no special characters that need URL-encoding (use `%40` for `@`, `%23` for `#`).

If `"gemini": "error"`: double-check `GEMINI_API_KEY` — ensure it was not truncated when pasting.

### Step 6: Verify Render Starter Plan is Active

1. Go to service settings.
2. Confirm **Instance Type: Starter**.
3. Confirm there is no "Spin Down on Idle" toggle — Starter plans do not have this option (it only appears on the free tier).

---

## 7. Channel Service — Render Deployment

Follow the same steps as §6 with the following differences:

### Repository

`xeno-copilot-channel`

### Render Service Configuration

| Setting | Value |
|---------|-------|
| Name | `xeno-copilot-channel` |
| Region | **Singapore** (same as CRM Service — reduces callback latency) |
| Branch | `main` |
| Runtime | `Node` |
| Build Command | `npm install && npm run build` |
| Start Command | `npm run start` |
| Instance Type | **Starter ($7/mo)** |

### Environment Variables

| Variable | Value |
|----------|-------|
| `MONGODB_URI` | Same Atlas connection string as CRM Service |
| `CRM_SERVICE_URL` | `https://xeno-copilot-crm.onrender.com` |
| `DEMO_BRAND_ID` | Same value as CRM Service (set after seed) |
| `PORT` | `3002` |
| `NODE_ENV` | `production` |
| `SENDGRID_API_KEY` | Your SendGrid API key |
| `SENDGRID_FROM_EMAIL` | Your verified sender email address |
| `WHATSAPP_SUCCESS_RATE` | `0.95` |
| `SMS_SUCCESS_RATE` | `0.90` |
| `MOCK_DELIVERY_DELAY_MS` | `200` |

### Verify Poll Loop is Running

After deployment, go to **Logs** tab on the Render service dashboard. Within 10 seconds of startup, you should see:

```
Channel Service started. Polling for dispatch jobs every 2000ms.
[poller] No jobs in queue. Waiting...
[poller] No jobs in queue. Waiting...
```

This confirms the Channel Service connected to MongoDB and the poll loop is active.

If the poll loop is not logging: check that `MONGODB_URI` is identical to the one in the CRM Service. Both services must connect to the same Atlas cluster.

### Smoke Test

```bash
curl https://xeno-copilot-channel.onrender.com/health
```

Expected:
```json
{
  "status": "ok",
  "service": "xeno-copilot-channel",
  "checks": { "mongodb": "ok", "dispatchQueueDepth": 0 }
}
```

---

## 8. Frontend — Vercel Deployment

### Step 1: Connect Repository

1. Log in to vercel.com.
2. Click **Add New → Project**.
3. Import `xeno-copilot-frontend` from GitHub.
4. Framework preset: **Next.js** (auto-detected).
5. Build command: `next build` (default).
6. Output directory: `.next` (default).
7. **Do not deploy yet** — add environment variables first.

### Step 2: Add Environment Variables

In the Vercel project settings → **Environment Variables**:

| Variable | Value | Environments |
|----------|-------|--------------|
| `NEXT_PUBLIC_CRM_API_URL` | `https://xeno-copilot-crm.onrender.com/api/v1` | Production, Preview, Development |
| `NEXT_PUBLIC_API_SECRET_TOKEN` | Same value as CRM Service `API_SECRET_TOKEN` | Production, Preview, Development |

**Note on token exposure:** `NEXT_PUBLIC_*` variables are embedded in the browser bundle and are visible to anyone who inspects the page source. This is acceptable for a demo with no real user authentication. Be ready to explain this during the interview: "In production, this would use a proper session-based auth system with the token scoped server-side."

### Step 3: Deploy

Click **Deploy**. Vercel will:
1. Clone the repository.
2. Run `npm install && next build`.
3. Deploy to a global CDN.

Build takes 2–4 minutes. Monitor the build logs for TypeScript errors.

### Step 4: Set Custom Domain (Optional)

Vercel provides a default URL like `xeno-copilot-abc123.vercel.app`. For a cleaner demo URL:
1. Go to project **Settings → Domains**.
2. Add `xeno-copilot.vercel.app` (the `vercel.app` subdomain is free).
3. Or use the auto-generated URL directly — it is permanent.

### Step 5: Smoke Test

Open the deployed URL. Expected:
- Dashboard loads with empty state (no customers yet — seed data not loaded).
- No JavaScript errors in browser console.
- Network tab shows `GET /api/v1/analytics/dashboard` returns a valid response (may show zeros before seed).

### Step 6: Verify CORS

The CRM Service must accept requests from the Vercel domain.

In `xeno-copilot-crm`, the CORS configuration must include:
```
FRONTEND_URL=https://xeno-copilot.vercel.app
```

If you see `CORS policy: No 'Access-Control-Allow-Origin' header` errors in the browser console: verify `FRONTEND_URL` matches the exact Vercel URL (no trailing slash).

---

## 9. Environment Variables Reference

Complete reference for all three services. Keep a local copy of this table with actual values filled in — do not commit it to version control.

### xeno-copilot-crm

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `MONGODB_URI` | Yes | Full Atlas connection string | `mongodb+srv://...` |
| `GEMINI_API_KEY` | Yes | Google AI Studio API key | `AIzaSy...` |
| `API_SECRET_TOKEN` | Yes | Bearer token for API authentication | `a3f1e2b4c5d6...` (64 hex chars) |
| `CHANNEL_SERVICE_URL` | Yes | Base URL for Channel Service | `https://xeno-copilot-channel.onrender.com` |
| `DEMO_BRAND_ID` | Yes | ObjectId of the Raga brand from seed | `664a000000000000000000001` |
| `PORT` | Yes | HTTP listen port | `3001` |
| `NODE_ENV` | Yes | Runtime environment | `production` |
| `FRONTEND_URL` | Yes | Allowed CORS origin | `https://xeno-copilot.vercel.app` |
| `REPORT_MIN_HOURS_AFTER_COMPLETION` | No | Override for demo (set to 0 to skip 48h wait) | `0` |
| `SENDGRID_FROM_EMAIL` | No | Verified sender address | `demo@yourdomain.com` |
| `GEMINI_FLASH_TIMEOUT_MS` | No | Timeout for Flash model calls | `5000` |
| `GEMINI_PRO_TIMEOUT_MS` | No | Timeout for Pro model calls | `10000` |
| `CAMPAIGN_MESSAGE_CTA_URL` | No | Default CTA URL if none in cluster | `https://raga.store` |

### xeno-copilot-channel

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `MONGODB_URI` | Yes | Same Atlas connection string as CRM Service | `mongodb+srv://...` |
| `CRM_SERVICE_URL` | Yes | Base URL for CRM Service callback endpoint | `https://xeno-copilot-crm.onrender.com` |
| `DEMO_BRAND_ID` | Yes | Same ObjectId as CRM Service | `664a000000000000000000001` |
| `PORT` | Yes | HTTP listen port | `3002` |
| `NODE_ENV` | Yes | Runtime environment | `production` |
| `SENDGRID_API_KEY` | Yes | SendGrid API key for real email | `SG.xxxx` |
| `SENDGRID_FROM_EMAIL` | Yes | Verified sender address | `demo@yourdomain.com` |
| `WHATSAPP_SUCCESS_RATE` | No | Mock WhatsApp delivery success rate | `0.95` |
| `SMS_SUCCESS_RATE` | No | Mock SMS delivery success rate | `0.90` |
| `MOCK_DELIVERY_DELAY_MS` | No | Simulated provider latency | `200` |
| `POLL_INTERVAL_MS` | No | Dispatch job poll interval | `2000` |
| `MAX_JOB_ATTEMPTS` | No | Max retry attempts per dispatch job | `3` |

### xeno-copilot-frontend

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `NEXT_PUBLIC_CRM_API_URL` | Yes | CRM Service base URL | `https://xeno-copilot-crm.onrender.com/api/v1` |
| `NEXT_PUBLIC_API_SECRET_TOKEN` | Yes | Bearer token (same as CRM `API_SECRET_TOKEN`) | `a3f1e2b4c5d6...` |

### Local Development Override

For local development, each service has a `.env.local` (or `.env`) file not committed to git. Add `.env` and `.env.local` to `.gitignore` before the first commit.

**Local development URLs:**
```
NEXT_PUBLIC_CRM_API_URL=http://localhost:3001/api/v1
CRM_SERVICE_URL=http://localhost:3001
CHANNEL_SERVICE_URL=http://localhost:3002
```

---

## 10. Seed Data Loading

The seed script populates MongoDB with the Raga demo dataset. It must be run **after** both Render services are deployed and healthy, but **before** running the end-to-end demo.

### What the Seed Script Creates

| Collection | Documents | Notes |
|------------|-----------|-------|
| `customers` | 1,000 | Realistic Indian names, +91 phones, varied RFM profiles |
| `orders` | 3,000 | 120 days of history, INR amounts, Raga product categories |
| `campaigns` | 2 | One COMPLETED (with AI report), one ACTIVE |
| `campaign_clusters` | 4 | Two clusters per campaign |
| `campaign_messages` | ~350 | Messages from both seed campaigns |
| `communication_events` | ~1,200 | Delivery + engagement events for seed campaigns |
| `channel_stats` | 4 | WIN_BACK and VIP_LOYALTY, per channel |
| `ai_logs` | 8 | One per AI call for both seed campaigns |

After seeding, the Atlas dashboard should show:
- `customers`: 1,000 documents, ~2 MB
- `orders`: 3,000 documents, ~5 MB
- All collections: ~20–25 MB total (well within M0's 512 MB)

### Running the Seed Script

The seed script is in `xeno-copilot-crm/src/scripts/seed.ts`. Run it locally, pointing at the production Atlas cluster:

```bash
cd xeno-copilot-crm
MONGODB_URI="mongodb+srv://xeno-copilot-app:<password>@..." \
NODE_ENV=production \
npx ts-node src/scripts/seed.ts
```

Expected output:
```
Connecting to MongoDB Atlas...
Connected.
Clearing existing data...
Creating brand: Raga...
  Brand ID: 664a000000000000000000001
Creating 1000 customers...
  ✓ 1000 customers created
Computing RFM scores...
  ✓ RFM computed: CHAMPIONS=127, PROMISING=183, AT_RISK=95, DORMANT_VIP=61, LAPSED=289, GENERAL=245
Creating 3000 orders...
  ✓ 3000 orders created
Creating seed campaigns...
  ✓ Campaign 1: "Diwali Win-Back April 2025" (COMPLETED, with AI report)
  ✓ Campaign 2: "VIP Loyalty May 2025" (ACTIVE, delivery in progress)
Creating channel stats...
  ✓ 4 channel_stats documents created
Seed complete. Brand ID: 664a000000000000000000001
```

### Set DEMO_BRAND_ID

Copy the Brand ID from the seed output. Update the `DEMO_BRAND_ID` environment variable on **both** Render services:

1. Go to `xeno-copilot-crm` → Environment → edit `DEMO_BRAND_ID`.
2. Go to `xeno-copilot-channel` → Environment → edit `DEMO_BRAND_ID`.

Render will automatically redeploy both services when environment variables change. Wait for both to show **Live** status before continuing.

### Verify Seed Data

After both services redeploy:

```bash
# Verify RFM segments
curl -H "Authorization: Bearer <API_SECRET_TOKEN>" \
  https://xeno-copilot-crm.onrender.com/api/v1/segments

# Expected: 6 segments, totalCustomers: 1000

# Verify seed campaigns
curl -H "Authorization: Bearer <API_SECRET_TOKEN>" \
  https://xeno-copilot-crm.onrender.com/api/v1/campaigns

# Expected: 2 campaigns (COMPLETED + ACTIVE)
```

### Re-Seeding

If you need to re-seed (e.g., data was corrupted during testing):

The seed script must clear existing data before re-inserting. Ensure the script includes `deleteMany({})` on all collections at the start, scoped to `{ brandId: DEMO_BRAND_ID }` so it only removes the demo brand's data.

**Do not drop the entire collection** — this would also drop the indexes and require them to be rebuilt. Scoped `deleteMany` is safer.

---

## 11. Health Checks

Both Render services expose a `/health` endpoint. Render itself does not automatically call this endpoint — the health checks described here are for manual verification and demo preparation.

### CRM Service Health

```
GET https://xeno-copilot-crm.onrender.com/health
```

**Healthy response (HTTP 200):**
```json
{
  "status": "ok",
  "service": "xeno-copilot-crm",
  "version": "1.0.0",
  "timestamp": "2025-04-20T10:00:00.000Z",
  "checks": {
    "mongodb": "ok",
    "gemini": "ok"
  }
}
```

**Degraded response (HTTP 503):**
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

**What each check verifies:**

| Check | How | Pass Condition |
|-------|-----|----------------|
| `mongodb` | `db.admin().ping()` | Returns `{ ok: 1 }` within 2 seconds |
| `gemini` | Test call: Flash model, `{"test":true}` prompt | Returns HTTP 200 within 3 seconds |

If `gemini` check is `"error"` but the API key is correct: Gemini may be experiencing a regional outage. The service is still usable — campaign creation will fail at the AI steps but all other endpoints work.

### Channel Service Health

```
GET https://xeno-copilot-channel.onrender.com/health
```

**Healthy response (HTTP 200):**
```json
{
  "status": "ok",
  "service": "xeno-copilot-channel",
  "version": "1.0.0",
  "timestamp": "2025-04-20T10:00:00.000Z",
  "checks": {
    "mongodb": "ok",
    "dispatchQueueDepth": 0
  }
}
```

`dispatchQueueDepth` shows the count of `QUEUED` jobs. During an active campaign this number will be non-zero and decreasing. If it is stuck at a high number (> 50 and not decreasing): the poll loop has stalled — restart the Channel Service.

### Frontend Health

The frontend has no health endpoint. Use these browser-side checks:

1. Open the production URL — page must render within 3 seconds.
2. Open browser DevTools → Network tab → confirm `GET /api/v1/analytics/dashboard` returns HTTP 200.
3. Confirm no `401 Unauthorized` or `CORS` errors in the console.

### Automated Health Ping (Demo Day Setup)

To prevent Render cold starts during the demo, add a `/health` ping from the frontend. In the root layout, add a `useEffect` that fires once on mount:

```
On page load → fetch GET /api/v1/health → discard response
```

This ensures the CRM Service receives a request within the first second of the evaluator opening the app, warming any connection pool that may have cooled.

---

## 12. Monitoring

### Render Logs

The primary monitoring tool for both backend services.

**Access:** Render dashboard → service → **Logs** tab.

**What to watch during a live campaign:**

```
[poller] Claimed job: dispatch_jobs/664d...  channel=WHATSAPP customer=Priya Sharma
[provider] WHATSAPP sent: wamid.xxxxx
[callback] POST /callbacks/delivery → 200 OK  messageId=664d... event=DELIVERED
[poller] Job 664d... → DONE (attempt 1)
```

This log sequence (claim → send → callback → done) repeating every 2 seconds is the normal healthy pattern during campaign execution.

**Warning patterns to watch for:**

| Log Pattern | Meaning | Action |
|-------------|---------|--------|
| `[callback] POST /callbacks/delivery → 401` | HMAC validation failing | Check hmacSecret in dispatch_jobs matches campaigns.hmacSecret |
| `[poller] Job 664d... → FAILED (attempt 3)` | Exhausted retries | Normal for ~5% of mock messages. Not an error. |
| `[poller] No jobs in queue` repeated > 60s during active campaign | Poll loop stopped or queue drained | Check campaign status in Atlas — may be legitimately complete |
| `MongoServerError: connection pool timed out` | Atlas connection issue | Restart Channel Service from Render dashboard |

### MongoDB Atlas Monitoring

**Access:** Atlas → cluster → **Metrics** tab.

Charts to check before and during the demo:
- **Connections:** Should stay below 20 (we allocate 10 max). Spike to 500 = connection leak.
- **Operations:** Should spike during seed loading and campaign dispatch. Flat during idle.
- **Network:** Should be near-zero between campaigns. Active during dispatch.
- **Storage:** Should stay below 50 MB for the demo dataset.

**Atlas Performance Advisor:** After running a few campaigns, check Performance Advisor for slow query warnings. If it flags `dispatch_jobs` queries as slow: the `{status: 1, createdAt: 1}` index may not have been created. Verify indexes in Atlas → Collections → Indexes tab.

### Vercel Analytics

**Access:** Vercel dashboard → project → **Analytics** tab.

Useful for demo preparation:
- **Web Vitals:** Confirm LCP (Largest Contentful Paint) < 2.5s for the dashboard page.
- **Edge Network:** Confirms the frontend is served from CDN (no latency for evaluator).
- **Function Logs:** If using Next.js Server Components for data fetching — check for server-side errors here.

### Cost Monitoring

**Gemini API costs:**

Monitor at aistudio.google.com → **API usage** tab. Each campaign costs ~$0.011 in API calls. If you see unusually high costs, check `ai_logs` in MongoDB for failed calls that may have triggered excessive retries.

**Render costs:**

Two Starter instances at $7/mo = $14/mo. Render billing is pro-rated daily. If you deploy on Day 1 of the month and the internship ends on Day 5, the total cost for Render will be ~$2.33.

---

## 13. Demo Day Checklist

Complete this checklist in order, starting 60 minutes before the presentation.

### T-60 min: Infrastructure Verification

- [ ] `curl https://xeno-copilot-crm.onrender.com/health` → `{ "status": "ok" }`
- [ ] `curl https://xeno-copilot-channel.onrender.com/health` → `{ "status": "ok", "dispatchQueueDepth": 0 }`
- [ ] Open the Vercel frontend URL — dashboard loads with Raga data
- [ ] Verify customer count on dashboard: 1,000
- [ ] Verify RFM segments page: 6 segments visible, Dormant VIPs = ~61
- [ ] Verify campaigns list: 2 campaigns (1 COMPLETED with report, 1 ACTIVE)
- [ ] Open COMPLETED campaign detail — AI report section visible and populated
- [ ] Check Render logs for Channel Service — poll loop running, no error messages

### T-30 min: Demo Flow Warm Run

Run the exact demo campaign once to warm Gemini's response and verify end-to-end flow:

- [ ] Navigate to `/campaigns/create`
- [ ] Type: "Win back customers who haven't purchased in 90 days"
- [ ] Gate 1 confirmation appears — click "Yes, that's right"
- [ ] Audience narrative appears (< 4 seconds)
- [ ] Persona cards visible on cluster cards
- [ ] Messages appear (< 6 seconds total)
- [ ] Click "Approve Audience"
- [ ] Click "Launch Campaign"
- [ ] Campaign detail page opens — status shows ACTIVE
- [ ] Wait 30 seconds — delivery stats updating (Delivered count increasing)

**Note the campaign URL from this warm run.** If the live demo campaign stalls, you can navigate back to this warm-run campaign and demonstrate from there.

### T-15 min: Browser Tab Setup

Open these tabs in this order and leave them open:

1. **Tab 1:** `https://xeno-copilot.vercel.app/dashboard` — Raga dashboard
2. **Tab 2:** `https://xeno-copilot.vercel.app/segments` — RFM segments
3. **Tab 3:** `https://xeno-copilot.vercel.app/campaigns` — campaigns list
4. **Tab 4:** `https://xeno-copilot.vercel.app/campaigns/create` — blank, ready
5. **Tab 5:** `https://xeno-copilot.vercel.app/campaigns/<COMPLETED_ID>` — completed campaign with AI report
6. **Tab 6:** Render logs for Channel Service — open in background, resize to half screen

Close all other browser tabs. Notification noise during a screen-share is unprofessional.

### T-5 min: Final Checks

- [ ] Screen sharing is set up and tested
- [ ] Font size in browser increased to 125% (evaluator sees clearer text)
- [ ] Render Starter services confirmed running (no yellow "Suspended" badge)
- [ ] Phone is silenced
- [ ] Chat notifications are muted

### During Demo: What Not to Do

- Do not open Atlas in the browser mid-demo unless specifically asked. Navigating through Atlas during a demo looks like you are debugging rather than demonstrating.
- Do not show raw JSON API responses mid-flow. The demo is the UI, not the API.
- Do not apologise for latency. If Call 3 takes 5 seconds, say "the AI is generating cluster-specific messages" — it is a feature, not a delay.
- Do not skip Gate 1 or Gate 2. These are the product's safety story. They should be explicitly narrated.

---

## 14. Failure Recovery Checklist

Steps to take when specific failures occur during or before the demo.

### CRM Service Returns 503 / Render Shows Build Failed

**Diagnosis:**
1. Go to Render → `xeno-copilot-crm` → **Logs** tab.
2. Read the last 20 lines of the build log.

**Common causes and fixes:**

| Error in Log | Fix |
|---|---|
| `Cannot find module '...'` | Run `npm install` locally and commit `package-lock.json` |
| `MongooseServerSelectionError` | Check `MONGODB_URI` — Atlas may have regenerated credentials |
| `Error: GEMINI_API_KEY is not set` | Verify environment variable is set (not blank) in Render |
| `SyntaxError: ...` | TypeScript compile error — check `npm run build` locally before pushing |
| Build timeout (> 15 min) | `node_modules` is being committed — add to `.gitignore` and force-push |

After fixing: **Manual Deploy → Deploy latest commit** in Render dashboard.

### Channel Service Poll Loop Has Stopped

**Symptom:** `dispatchQueueDepth` is non-zero in health check but not decreasing. Render logs show no poll activity.

**Fix:**
1. Go to Render → `xeno-copilot-channel` → **Manual Deploy → Deploy latest commit**.
2. This restarts the service and reinitialises the poll loop.
3. If the issue recurs: check for an uncaught exception in logs that is killing the process. The poll loop must be wrapped in a try/catch that logs the error and continues — a single failed job must never crash the service.

### HMAC Callbacks Failing (401 from CRM)

**Symptom:** Channel Service logs show `[callback] POST /callbacks/delivery → 401`. Delivery stats never update despite dispatch jobs completing.

**Diagnosis:** The `hmacSecret` stored on the dispatch job does not match the secret on the campaign document.

**Fix:**
1. In Atlas, find one affected `dispatch_jobs` document.
2. Copy its `callbackHmacSecret`.
3. Find the associated `campaigns` document.
4. Verify `campaigns.hmacSecret` matches.
5. If they differ: the launch service generated the secret correctly but did not write it to dispatch_jobs. Fix the launch service logic.

**Demo day workaround:** Navigate to the pre-seeded COMPLETED campaign (which has correct pre-populated stats). Demonstrate from there.

### Gemini API Returns 429 (Rate Limited)

**Symptom:** Intent extraction or message generation fails with `AI_UNAVAILABLE`.

**Cause:** Hit the free tier limit (15 req/min for Flash, 2 req/min for Pro).

**Fix:**
1. Wait 60 seconds for the per-minute rate limit to reset.
2. Retry the operation.
3. If it happens during the demo: say "The AI has a rate limit on the free tier — in production this would use a paid quota. Let me show you the result I prepared earlier." Navigate to the warm-run campaign from T-30 min.

**Prevention:** Do not run test campaigns immediately before the demo. Save Pro model quota for the demo itself.

### Frontend Fails to Load (CORS Error)

**Symptom:** Browser console shows `CORS policy: No 'Access-Control-Allow-Origin' header`.

**Cause:** `FRONTEND_URL` environment variable on the CRM Service does not match the actual Vercel URL.

**Fix:**
1. Copy the exact Vercel URL from the browser address bar (e.g., `https://xeno-copilot-abc123.vercel.app`).
2. Update `FRONTEND_URL` in Render environment variables to match exactly.
3. Render auto-redeploys. Wait 2 minutes.

### Seed Data Missing (Dashboard Shows Zeros)

**Symptom:** Dashboard shows 0 customers, 0 campaigns after deployment.

**Cause:** Seed script was not run, or `DEMO_BRAND_ID` was not updated after seeding.

**Fix:**
1. Re-run the seed script against the production Atlas URI.
2. Copy the Brand ID from the script output.
3. Update `DEMO_BRAND_ID` on both Render services.
4. Wait for both services to redeploy.

### MongoDB Atlas Connection Refused

**Symptom:** Both services fail health check with `"mongodb": "error"`. Atlas shows connection attempts failing.

**Cause:** IP whitelist may have been reset, or Atlas credentials changed.

**Fix:**
1. Go to Atlas → **Network Access** → verify `0.0.0.0/0` is listed.
2. If the whitelist entry is missing: re-add it.
3. Go to Atlas → **Database Access** → verify `xeno-copilot-app` user exists with correct password.
4. If password was changed: update `MONGODB_URI` on both Render services with the new password.

---

## 15. Production Readiness Checklist

This checklist defines "done" for the deployment. Complete it before sharing the demo URL with the Xeno team.

### Infrastructure

- [ ] MongoDB Atlas M0 cluster running in ap-south-1 or ap-southeast-1
- [ ] Atlas network access allows `0.0.0.0/0`
- [ ] Atlas database user `xeno-copilot-app` has read/write access
- [ ] CRM Service deployed on Render **Starter** (not free tier)
- [ ] Channel Service deployed on Render **Starter** (not free tier)
- [ ] Frontend deployed on Vercel, accessible via public URL
- [ ] All three services using HTTPS (Render and Vercel provide TLS automatically)

### Environment Variables

- [ ] `MONGODB_URI` set identically on CRM and Channel services
- [ ] `GEMINI_API_KEY` set on CRM service, returns valid response to test call
- [ ] `API_SECRET_TOKEN` is 64 hex characters (32 bytes)
- [ ] `CHANNEL_SERVICE_URL` on CRM points to the correct Render URL
- [ ] `CRM_SERVICE_URL` on Channel points to the correct Render URL
- [ ] `DEMO_BRAND_ID` matches the ObjectId created by seed script on both services
- [ ] `FRONTEND_URL` on CRM matches the exact Vercel deployment URL
- [ ] `NEXT_PUBLIC_CRM_API_URL` on frontend points to CRM Render URL
- [ ] `NEXT_PUBLIC_API_SECRET_TOKEN` matches `API_SECRET_TOKEN` on CRM
- [ ] No variable contains `localhost` in production
- [ ] `.env` and `.env.local` are in `.gitignore` on all three repositories

### Seed Data

- [ ] `db.customers.countDocuments()` = 1,000
- [ ] `db.orders.countDocuments()` = 3,000
- [ ] `db.customers.distinct('rfmSegment').length` = 6
- [ ] `db.campaigns.countDocuments()` = 2
- [ ] COMPLETED campaign has `aiReport` field populated
- [ ] ACTIVE campaign has `communication_events` documents
- [ ] `db.channel_stats.countDocuments()` >= 4
- [ ] `db.dispatch_jobs.countDocuments({ status: "QUEUED" })` = 0 (no stale jobs)

### API Smoke Tests

Run these against the production CRM Service URL:

```bash
BASE="https://xeno-copilot-crm.onrender.com/api/v1"
TOKEN="<your API_SECRET_TOKEN>"

# Health
curl $BASE/../health
# → { "status": "ok" }

# Segments
curl -H "Authorization: Bearer $TOKEN" $BASE/segments
# → 6 segments, totalCustomers: 1000

# Campaigns
curl -H "Authorization: Bearer $TOKEN" $BASE/campaigns
# → 2 campaigns

# Intent extraction
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"goalText":"Win back customers dormant 90 days"}' \
  $BASE/campaigns/intent-extract
# → { intentType: "WIN_BACK_DORMANT", confirmationText: "..." }

# Click tracking (use a real messageId from seed data)
curl -I https://xeno-copilot-crm.onrender.com/track/click/<messageId>
# → HTTP/2 302  Location: https://raga.store/...
```

All 5 requests must return the expected responses before the deployment is considered ready.

### End-to-End Flow Test

- [ ] Create campaign from `/campaigns/create` using "Win back customers dormant 90 days"
- [ ] Gate 1 confirmation appears within 2 seconds
- [ ] Audience narrative appears within 4 seconds of clicking confirm
- [ ] Persona cards visible on both cluster cards
- [ ] Messages visible within 6 seconds of audience preview loading
- [ ] "Refine with AI" dialog opens and returns refined messages
- [ ] Campaign transitions to READY_FOR_REVIEW after clicking Approve Audience
- [ ] Campaign transitions to ACTIVE after clicking Launch
- [ ] Campaign detail page shows increasing Delivered count within 30 seconds of launch
- [ ] After all jobs process: `db.dispatch_jobs.countDocuments({ status: "QUEUED" })` = 0

### Security Baseline

- [ ] Bearer token is required on all CRM endpoints except `/health` and `/track/click/:messageId`
- [ ] Callback endpoint uses HMAC validation, not Bearer token
- [ ] No MongoDB operators (`$where`, `$expr`, raw filter objects) appear in any Gemini API request
- [ ] Sensitive environment variables (`GEMINI_API_KEY`, `MONGODB_URI`, `API_SECRET_TOKEN`) not present in any committed file
- [ ] `SENDGRID_API_KEY` not logged in any log output
- [ ] `hmacSecret` field on Campaign is not returned in any API response (exclude from serialisation)

### Demo Readiness

- [ ] Demo day checklist from §13 completed successfully in a dry run
- [ ] All 5 likely interview questions answered confidently (see ROADMAP.md §13)
- [ ] All 5 contingency responses rehearsed
- [ ] Demo URL shared with evaluator in the submission email
- [ ] Repository links shared (all three, set to private with evaluator added as collaborator)

---

*Document Status: Version 1.0 — Complete.*  
*All 7 documentation files are now complete: PRD.md · SYSTEM_ARCHITECTURE.md · DATABASE_SCHEMA.md · API_SPEC.md · AI_FEATURES.md · ROADMAP.md · DEPLOYMENT.md*
