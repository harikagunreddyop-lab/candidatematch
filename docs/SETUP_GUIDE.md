# CandidateMatch — Complete Setup Guide

A step-by-step guide to get CandidateMatch running locally and in production.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Clone & Install](#2-clone--install)
3. [Supabase Setup](#3-supabase-setup)
4. [Create `.env` File](#4-create-env-file)
5. [Redis Setup](#5-redis-setup)
6. [Run Locally](#6-run-locally)
7. [Optional: Resume Worker](#7-optional-resume-worker)
8. [Optional: Billing, Email, Monitoring](#8-optional-billing-email-monitoring)
9. [Production Deployment](#9-production-deployment)
10. [Verify & Troubleshoot](#10-verify--troubleshoot)

---

## 1. Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 18+ | Runtime |
| npm | 9+ | Package manager |
| Git | — | Clone repo |
| Redis | 7+ (optional for local) | Queues, cache |

---

## 2. Clone & Install

```bash
# Clone the repo
git clone <your-repo-url>
cd candidatematch

# Install dependencies
npm install

# Verify build
npm run build
```

**Pass:** Build completes without errors.

---

## 3. Supabase Setup

### 3.1 Create a Supabase project

1. Go to [supabase.com](https://supabase.com) → **Start your project**
2. Create a new project (name, password, region)
3. Wait for the project to finish provisioning

### 3.2 Get API keys

1. Supabase Dashboard → **Settings** → **API**
2. Copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** key → `SUPABASE_SERVICE_ROLE_KEY` (keep secret)

### 3.3 Run database migrations

**Option A — Supabase CLI (recommended):**

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

**Option B — Manual (SQL Editor):**

1. Supabase Dashboard → **SQL Editor**
2. Run each migration file in `supabase/migrations/` in order (001, 002, … 999)

### 3.4 Configure Auth URLs (for local dev)

1. Supabase Dashboard → **Authentication** → **URL Configuration**
2. **Site URL:** `http://localhost:3000`
3. **Redirect URLs:** add `http://localhost:3000/**` and `http://localhost:3000/auth/callback`
4. Save

---

## 4. Create `.env` File

Create `.env` in the project root (copy from `.env.example` if it exists):

```env
# ═══════════════════════════════════════════════════════════
# REQUIRED — App won't start without these
# ═══════════════════════════════════════════════════════════

NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# ═══════════════════════════════════════════════════════════
# CORE APP
# ═══════════════════════════════════════════════════════════

NEXT_PUBLIC_APP_URL=http://localhost:3000

# ═══════════════════════════════════════════════════════════
# AI (required for AI features: matching, resume, ATS, etc.)
# ═══════════════════════════════════════════════════════════

ANTHROPIC_API_KEY=sk-ant-your-key

# Get key: console.anthropic.com → API Keys

# ═══════════════════════════════════════════════════════════
# SECRETS (generate with: openssl rand -hex 32)
# ═══════════════════════════════════════════════════════════

CRON_SECRET=your-cron-secret
WORKER_SECRET=your-worker-secret

# ═══════════════════════════════════════════════════════════
# REDIS (required for queues; optional for minimal run)
# ═══════════════════════════════════════════════════════════

REDIS_URL=redis://localhost:6379

# ═══════════════════════════════════════════════════════════
# OPTIONAL — Resume worker (if using resume generation)
# ═══════════════════════════════════════════════════════════

# RESUME_WORKER_URL=http://localhost:3001

# ═══════════════════════════════════════════════════════════
# OPTIONAL — Upstash (cache, rate limit, feature flags)
# ═══════════════════════════════════════════════════════════

# UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
# UPSTASH_REDIS_REST_TOKEN=xxx
```

**Generate secrets:**

```bash
# Any platform (Node.js — works on Windows)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

```powershell
# Windows (PowerShell) — alternative
-join ((48..57) + (97..102) | Get-Random -Count 64 | ForEach-Object { [char]$_ })
```

```bash
# macOS / Linux (if openssl installed)
openssl rand -hex 32
```

---

## 5. Redis Setup

### Option A — Local Redis (Docker)

```bash
docker run -d -p 6379:6379 redis:7-alpine
```

Then set in `.env`:

```
REDIS_URL=redis://localhost:6379
```

### Option B — Upstash (hosted, free tier)

1. Go to [upstash.com](https://upstash.com) → Create account
2. Create a Redis database (region closest to you)
3. Copy **REST URL** and **REST Token**
4. Add to `.env`:

```
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=xxx
```

For queues (BullMQ), you still need `REDIS_URL`. Upstash provides a Redis URL in the dashboard — use that for `REDIS_URL` if you prefer a single Redis instance.

### Option C — Skip Redis (minimal local run)

- Omit `REDIS_URL` — queues won't work, but the app may start
- Some features (job ingest, match cron, resume worker) require Redis

---

## 6. Run Locally

```bash
# Start the Next.js app
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

**Verify:**

- Homepage loads
- Sign up / login works
- Dashboard loads (after creating a profile)

**Health check:**

```bash
curl http://localhost:3000/api/health
# Expected: {"status":"healthy"|"degraded","checks":{...}}
```

---

## 7. Optional: Resume Worker

The resume worker is a separate service for PDF generation and parsing.

### Local

```bash
# In a second terminal
cd worker
npm install
WORKER_SECRET=your-worker-secret node index.js
```

Then in `.env`:

```
RESUME_WORKER_URL=http://localhost:3001
WORKER_SECRET=your-worker-secret
```

### Production (Railway)

See **docs/RAILWAY_WORKER_SETUP.md** for step-by-step Railway deployment.

**Summary:**

1. Deploy `worker/` to Railway (root dir: `worker`)
2. Set `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `WORKER_SECRET` in Railway
3. Copy the Railway public URL → `RESUME_WORKER_URL` in your app
4. Use the same `WORKER_SECRET` in both app and worker

---

## 8. Optional: Billing, Email, Monitoring

### Stripe (billing)

1. [dashboard.stripe.com](https://dashboard.stripe.com) → API Keys
2. Create products and prices
3. Add to `.env`:

```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRO_PRICE_ID=price_...
# etc. (see docs/ENV_VARIABLES.md)
```

4. Set `FEATURE_BILLING_ENABLED=true`

### Resend (email)

1. [resend.com](https://resend.com) → API Keys
2. Verify your domain
3. Add to `.env`:

```
RESEND_API_KEY=re_...
FROM_EMAIL=noreply@yourdomain.com
```

4. Set `FEATURE_EMAIL_ENABLED=true`

### Sentry (error tracking)

1. [sentry.io](https://sentry.io) → Create project (Next.js)
2. Copy DSN
3. Add to `.env`:

```
NEXT_PUBLIC_SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
```

### PostHog (analytics)

1. [posthog.com](https://posthog.com) → Create project
2. Copy project API key
3. Add to `.env`:

```
NEXT_PUBLIC_POSTHOG_KEY=phc_...
```

### Gmail OAuth

1. [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials
2. Create OAuth 2.0 Client ID (Web application)
3. Add to `.env`:

```
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxx
```

---

## 9. Production Deployment

### 9.1 Environment variables (minimum)

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `NEXT_PUBLIC_APP_URL` | `https://your-domain.com` |
| `ANTHROPIC_API_KEY` | Anthropic key |
| `CRON_SECRET` | Strong random secret |
| `REDIS_URL` or Upstash vars | Redis connection |
| `RESUME_WORKER_URL` | Worker URL (if used) |
| `WORKER_SECRET` | Same as worker |
| `AUTOFILL_ALLOWED_ORIGINS` | `https://your-domain.com` (if using autofill) |

### 9.2 Supabase Auth (production)

1. Supabase → **Authentication** → **URL Configuration**
2. **Site URL:** `https://your-domain.com`
3. **Redirect URLs:** `https://your-domain.com/**`, `https://your-domain.com/auth/callback`

### 9.3 Deploy

- **AWS Amplify:** See **docs/QUICK_START_DEPLOYMENT_CHECKLIST.md**
- **Vercel:** Connect repo, add env vars, deploy
- **Docker:** Set `BUILD_STANDALONE=true`, build, run the standalone output

### 9.4 Cron (EventBridge / Vercel Cron)

| Endpoint | Schedule | Auth |
|----------|----------|------|
| `GET /api/cron/ingest` | Hourly | `Authorization: Bearer CRON_SECRET` |
| `GET /api/cron/match` | Every 6h | Same |
| `GET /api/cron/cleanup` | Daily | Same |

See **docs/CRON_AMPLIFY.md** for Amplify EventBridge setup.

---

## 10. Verify & Troubleshoot

### Health check

```bash
curl https://your-domain.com/api/health
```

Expected: `{"status":"healthy"|"degraded","checks":{...}}`

### Common issues

| Symptom | Check |
|---------|-------|
| Build fails | `npm run build` locally; fix TypeScript errors |
| Auth redirect errors | Supabase Site URL and Redirect URLs match `NEXT_PUBLIC_APP_URL` |
| "Invalid configuration" | All required env vars set; no typos in names |
| DB errors | Migrations applied; `SUPABASE_SERVICE_ROLE_KEY` correct |
| Queue / worker errors | `REDIS_URL` set and reachable |
| Resume generation fails | `RESUME_WORKER_URL` and `WORKER_SECRET` match worker |

### Reference

- **All env vars:** docs/ENV_VARIABLES.md
- **Deployment checklist:** docs/QUICK_START_DEPLOYMENT_CHECKLIST.md
- **Resume worker & autofill:** docs/SETUP_RESUME_WORKER_AND_AUTOFILL.md
- **Cron setup:** docs/CRON_AMPLIFY.md
