# Monitoring & Analytics Setup

## Required Services (All Free Tier)

### 1. Sentry (Error Tracking)
- Sign up: https://sentry.io
- Create project: Next.js
- Get DSN
- Add to Amplify env vars: `NEXT_PUBLIC_SENTRY_DSN`

### 2. PostHog (Product Analytics)
- Sign up: https://posthog.com
- Create project
- Get API key (Project API Key)
- Add to Amplify env vars: `NEXT_PUBLIC_POSTHOG_KEY`

### 3. Upstash Redis (Caching & Rate Limiting)
- Sign up: https://upstash.com
- Create database: Global (recommended)
- Get REST URL and Token
- Add to Amplify env vars:
  - `UPSTASH_REDIS_REST_URL`
  - `UPSTASH_REDIS_REST_TOKEN`

## AWS Amplify Environment Variables

Add these in AWS Amplify Console → App Settings → Environment Variables:

```bash
# Sentry
NEXT_PUBLIC_SENTRY_DSN=https://xxx@sentry.io/xxx
SENTRY_AUTH_TOKEN=xxx

# PostHog
NEXT_PUBLIC_POSTHOG_KEY=phc_xxx

# Upstash Redis
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=xxx
```

## Verification

After deployment, verify:

1. **Health Check:**
   ```bash
   curl https://orioncmos.com/api/health
   ```
   Should show: `database: healthy`, `cache: healthy` (when Upstash is configured).

2. **Sentry:** Trigger an error in the app and check the Sentry dashboard.

3. **PostHog:** Visit the site and check the PostHog dashboard for pageviews and server-side events (e.g. `job_created`).

4. **Rate Limiting:** Make many requests to `/api/market/jobs` from the same IP; you should eventually get a `429` response with `X-RateLimit-*` headers.

## Cost

All services used are FREE at typical usage:

- Sentry: 5k events/month
- PostHog: 1M events/month
- Upstash Redis: 10k requests/day

If Upstash or PostHog env vars are not set, the app continues to work without caching, rate limiting, or analytics.
