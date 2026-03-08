# Environment Variables Reference

All environment variables used by CandidateMatch. Set these in `.env` (local) or in your host’s dashboard (Amplify, Vercel, etc.).

---

## Required (app won’t start without these)

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | `https://xxxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous (public) key | From Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-only, keep secret) | From Supabase → Settings → API |

---

## Core app (strongly recommended)

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_APP_URL` | Public URL of the app (auth redirects, links, worker callbacks) | `https://your-app.com` or `http://localhost:3000` |
| `NODE_ENV` | Set by framework; `development` / `production` / `test` | Usually automatic |

---

## AI (Anthropic)

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `ANTHROPIC_API_KEY` | Yes for AI features | Anthropic API key | `sk-ant-...` |
| `ANTHROPIC_TIMEOUT_MS` | No | Request timeout in ms | `30000` (default) |

---

## Redis

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `REDIS_URL` | Yes for queues (BullMQ) | Redis connection URL | `redis://localhost:6379` or Upstash URL |
| `REDIS_HOST` | Alternative to REDIS_URL | Redis host (used with REDIS_PORT) | `localhost` |
| `REDIS_PORT` | With REDIS_HOST | Redis port | `6379` |
| `UPSTASH_REDIS_REST_URL` | No | Upstash REST URL (cache, rate limit, feature flags) | `https://xxx.upstash.io` |
| `UPSTASH_REDIS_REST_TOKEN` | No | Upstash REST token | From Upstash dashboard |

---

## Cron & worker security

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `CRON_SECRET` | Yes in production | Secret for protecting cron/event endpoints | `openssl rand -hex 32` |
| `WORKER_SECRET` | Yes if using resume worker | Shared secret between Next.js and resume worker | `openssl rand -hex 32` |
| `WORKER_PORT` | No | Resume worker listen port | `3001` (default) |

---

## Resume worker & autofill

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `RESUME_WORKER_URL` | Yes for resume generation | Full URL of resume worker (no trailing slash) | `http://localhost:3001` or `https://worker.your-app.com` |
| `AUTOFILL_ALLOWED_ORIGINS` | Yes in production for autofill | Allowed origins (comma-separated) | `https://your-app.com` |

---

## Stripe (billing)

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `STRIPE_SECRET_KEY` | Yes for billing | Stripe secret key | `sk_test_...` or `sk_live_...` |
| `STRIPE_PUBLISHABLE_KEY` | No (client-side) | Stripe publishable key | `pk_test_...` |
| `STRIPE_WEBHOOK_SECRET` | Yes for webhooks | Webhook signing secret | `whsec_...` |
| `STRIPE_PRO_PRICE_ID` | For candidate billing | Pro plan price ID | `price_...` |
| `STRIPE_PRO_ANNUAL_PRICE_ID` | For candidate annual | Pro annual price ID | `price_...` |
| `STRIPE_COMPANY_STARTER_MONTHLY` | Company plans | Starter monthly price ID | `price_...` |
| `STRIPE_COMPANY_STARTER_ANNUAL` | Company plans | Starter annual price ID | `price_...` |
| `STRIPE_COMPANY_PRO_MONTHLY` | Company plans | Pro monthly price ID | `price_...` |
| `STRIPE_COMPANY_PRO_ANNUAL` | Company plans | Pro annual price ID | `price_...` |
| `STRIPE_COMPANY_ENTERPRISE_MONTHLY` | Company plans | Enterprise monthly price ID | `price_...` |
| `STRIPE_COMPANY_ENTERPRISE_ANNUAL` | Company plans | Enterprise annual price ID | `price_...` |

---

## Email (Resend)

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `RESEND_API_KEY` | Yes for transactional email | Resend API key | `re_...` |
| `FROM_EMAIL` | No | Sender email (must be verified in Resend) | `noreply@yourdomain.com` |

---

## Monitoring & analytics

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `NEXT_PUBLIC_SENTRY_DSN` | No | Sentry DSN (client + server) | `https://xxx@xxx.ingest.sentry.io/xxx` |
| `SENTRY_DSN` | No | Server Sentry DSN (fallback) | Same as above |
| `SENTRY_AUTH_TOKEN` | No | For source maps / Sentry CLI | From Sentry project settings |
| `NEXT_PUBLIC_POSTHOG_KEY` | No | PostHog project API key | `phc_...` |
| `NEXT_PUBLIC_POSTHOG_HOST` | No | PostHog host | `https://app.posthog.com` (default) |

---

## Feature flags & rate limiting (env-based)

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `FEATURE_BILLING_ENABLED` | No | Enable billing UI and flows | `true` |
| `FEATURE_EMAIL_ENABLED` | No | Enable email (invites, etc.) | `true` |
| `FEATURE_AI_MATCHING_ENABLED` | No | Enable AI matching (default true) | `false` to disable |
| `RATE_LIMIT_ENABLED` | No | Enable rate limiting (default true) | `false` to disable |
| `RATE_LIMIT_MAX_REQUESTS` | No | Max requests per window | `100` |
| `RATE_LIMIT_WINDOW_MS` | No | Window in milliseconds | `60000` |

---

## Integrations & ingest

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `GOOGLE_CLIENT_ID` | For Gmail OAuth | Google OAuth client ID | From Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | For Gmail OAuth | Google OAuth client secret | From Google Cloud Console |
| `APIFY_API_TOKEN` | For Apify scrapers | Apify API token | From Apify dashboard |
| `ADZUNA_APP_ID` | For Adzuna connector | Adzuna app ID | From Adzuna |
| `ADZUNA_APP_KEY` | For Adzuna connector | Adzuna app key | From Adzuna |
| `OPENAI_API_KEY` | For semantic similarity | OpenAI API key | `sk-...` |
| `INGEST_USE_V3` | No | Use v3 ingest pipeline | `true` |
| `INGEST_ITEM_CONCURRENCY` | No | Ingest concurrency | `50` |
| `INGEST_CONNECTOR_CONCURRENCY` | No | Connector concurrency | `10` |
| `INGEST_UPSERT_BATCH_SIZE` | No | Batch size for upserts | `1000` |
| `INGEST_QUALITY_THRESHOLD` | No | Quality threshold (v3) | `40` |

---

## Build & deployment

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `BUILD_STANDALONE` | No | Use Next.js standalone output (e.g. Amplify/Docker) | `true` |
| `VERCEL_URL` | No | Set by Vercel; used as app URL fallback | Automatic on Vercel |
| `VERCEL_GIT_COMMIT_SHA` | No | Set by Vercel; used in logs | Automatic on Vercel |
| `NEXT_PUBLIC_SITE_URL` | No | Alternate app URL (invites, reset password) | Same as `NEXT_PUBLIC_APP_URL` |

---

## Debug / optional

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `DEBUG_MATCHING` | No | Verbose matching logs | `true` |
| `USE_ELITE_ATS` | No | Use Elite ATS (Claude Batches) for matching | `1` |

---

## Minimal local `.env` example

```env
# Required
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# App URL (required for auth and links)
NEXT_PUBLIC_APP_URL=http://localhost:3000

# AI (required for AI features)
ANTHROPIC_API_KEY=sk-ant-...

# Cron / worker (use strong secrets in production)
CRON_SECRET=your-cron-secret
WORKER_SECRET=your-worker-secret

# Resume worker (if using resume generation)
RESUME_WORKER_URL=http://localhost:3001

# Redis (for queues; optional for minimal local run)
REDIS_URL=redis://localhost:6379

# Optional: Upstash (cache, rate limit, feature flags)
# UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
# UPSTASH_REDIS_REST_TOKEN=xxx

# Optional: Sentry, PostHog, Stripe, Resend, Gmail, etc. (see tables above)
```

---

## Production checklist (Amplify / similar)

Ensure at least:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL` = your production URL
- `ANTHROPIC_API_KEY`
- `CRON_SECRET` (for cron/event endpoints)
- `RESUME_WORKER_URL` (if using resume worker)
- `WORKER_SECRET` (if using resume worker)
- `AUTOFILL_ALLOWED_ORIGINS` (if using autofill extension)
- `REDIS_URL` and/or `UPSTASH_*` (for queues, cache, feature flags)

See **docs/QUICK_START_DEPLOYMENT_CHECKLIST.md** for full deployment steps.
