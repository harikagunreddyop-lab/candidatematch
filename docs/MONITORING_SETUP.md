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
# Optional: use for US region (default is EU app.posthog.com)
# NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com

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

2. **Sentry:** See [Verify Sentry below](#verify-sentry).

3. **PostHog:** See [Verify PostHog below](#verify-posthog).

4. **Rate Limiting:** Make many requests to `/api/market/jobs` from the same IP; you should eventually get a `429` response with `X-RateLimit-*` headers.

### Verify Sentry

Sentry shows **"Waiting for events"** until it receives at least one event. Do one of the following.

**A. Confirm env vars**

- Amplify Console → your app → **Environment variables**.
- Ensure **`NEXT_PUBLIC_SENTRY_DSN`** is set (value like `https://xxx@o123456.ingest.us.sentry.io/123456`).
- After changing env vars, **redeploy** the app.

**B. Send a test event (recommended)**

The app has an API route that sends a test exception to Sentry. Call it with your `CRON_SECRET` (same as used for cron endpoints):

```bash
# Replace YOUR_APP_URL and YOUR_CRON_SECRET
curl -H "Authorization: Bearer YOUR_CRON_SECRET" "https://YOUR_APP_URL/api/sentry-test"
# Or with query param:
curl "https://YOUR_APP_URL/api/sentry-test?key=YOUR_CRON_SECRET"
```

You should get `{"ok":true,"message":"Test event sent to Sentry..."}`. Within a few seconds, Sentry’s **Issues** or **Verify Installation** page should show the event **"Sentry verification test event"**.

**C. Trigger a real error**

Cause an unhandled error in the app (e.g. throw in a component or call a failing API). It should appear in Sentry **Issues**.

### Verify PostHog

**A. Confirm env vars in Amplify**
- Ensure **`NEXT_PUBLIC_POSTHOG_KEY`** is set (value like `phc_...`).
- Optional: **`NEXT_PUBLIC_POSTHOG_HOST`** — set to `https://us.i.posthog.com` if your PostHog project is in the US region; omit or use `https://app.posthog.com` for EU.

After changing env vars, **redeploy** the app so the new values are baked into the build.

**B. Confirm in the browser**

1. Deploy (or redeploy) the app so it has the PostHog key.
2. Open your live app URL in a browser (e.g. your Amplify URL or orioncmos.com).
3. Open DevTools (F12) → **Network** tab.
4. Filter by `posthog` or `i.posthog` (or just browse a few pages).
5. You should see requests to PostHog (e.g. `https://us.i.posthog.com/e` or `https://app.posthog.com/e`) with status 200.

**C. Confirm in PostHog dashboard**

1. Log in at [posthog.com](https://posthog.com) (or your US URL).
2. Open your project → **Activity** or **Live events** (or **Events**).
3. Browse your deployed site (click a few pages, log in if you can).
4. Within a few seconds you should see **$pageview** events (and any custom events like **job_created** if you triggered them).

If no events appear, double-check the API key in Amplify, that you redeployed after adding it, and that you’re looking at the correct PostHog project and region (US vs EU).

## Cost

All services used are FREE at typical usage:

- Sentry: 5k events/month
- PostHog: 1M events/month
- Upstash Redis: 10k requests/day

If Upstash or PostHog env vars are not set, the app continues to work without caching, rate limiting, or analytics.
