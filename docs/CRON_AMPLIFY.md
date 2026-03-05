# Cron Jobs — AWS EventBridge Scheduler Setup

CandidateMatch runs on **AWS Amplify** (Next.js). Amplify has no built-in cron runner,
so scheduled calls to `/api/cron/*` are triggered by **AWS EventBridge Scheduler**.

The three cron endpoints are:

| Endpoint | Default schedule | Purpose |
|---|---|---|
| `GET /api/cron/ingest` | Every 1 hour | Sync Greenhouse / Lever / Ashby connectors |
| `GET /api/cron/match` | Every 6 hours | Run incremental job matching |
| `GET /api/cron/cleanup` | Daily at 03:00 UTC | Delete stale applications |

All three require: `Authorization: Bearer <CRON_SECRET>`

---

## 1. Set CRON_SECRET in Amplify

1. **Amplify Console** → your app → **Environment variables** → Add variable:
   - **Variable name:** `CRON_SECRET`
   - **Value:** a long random string (32+ chars)

Generate one:
```powershell
# PowerShell
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 40 | % {[char]$_})
```

2. Redeploy the app after adding or changing `CRON_SECRET`.

---

## 2. Create EventBridge Schedulers

### Option A: AWS Console (recommended for first-time setup)

1. Open **AWS Console** → **Amazon EventBridge** → **Scheduler** → **Create schedule**.
2. For each of the three schedules below:

#### Schedule 1: Ingest (hourly)
- **Name:** `candidatematch-ingest`
- **Schedule pattern:** Recurring → Rate-based → `1 hour`
- **Target:** Templated target → **API destination** (HTTP endpoint)
  - **Invoke:** `GET https://<your-amplify-url>/api/cron/ingest`
  - **Headers:** `Authorization: Bearer <CRON_SECRET>`
- **Execution role:** Create a new role with EventBridge Scheduler execution permissions.
- **Retry policy:** Max 2 retries, max age 1 hour.

#### Schedule 2: Match (every 6 hours)
- **Name:** `candidatematch-match`
- **Schedule pattern:** Cron-based → `0 */6 * * ? *`
- **Target:** Same API destination pattern → `GET /api/cron/match`
- **Retry:** Max 1 retry, max age 2 hours.

#### Schedule 3: Cleanup (daily 3 AM UTC)
- **Name:** `candidatematch-cleanup`
- **Schedule pattern:** Cron-based → `0 3 * * ? *`
- **Target:** `GET /api/cron/cleanup`
- **Retry:** Max 1 retry, max age 3 hours.

> **Note:** AWS EventBridge cron expressions require 6 fields (not 5 like standard cron). The
> `?` is required for the day-of-week or day-of-month field. Use format: `cron(min hr dom month dow year)`.

### Option B: AWS CLI

```bash
# Create the schedule group first (one-time)
aws scheduler create-schedule-group --name candidatematch

# Ingest — every hour
aws scheduler create-schedule \
  --group-name candidatematch \
  --name candidatematch-ingest \
  --schedule-expression "rate(1 hour)" \
  --flexible-time-window '{"Mode":"OFF"}' \
  --target '{
    "Arn": "arn:aws:scheduler:::aws-sdk:http:invoke",
    "RoleArn": "<your-scheduler-role-arn>",
    "Input": "{\"Method\":\"GET\",\"Endpoint\":\"https://<your-app>/api/cron/ingest\",\"Headers\":{\"Authorization\":\"Bearer <CRON_SECRET>\"}}"
  }'

# Match — every 6 hours
aws scheduler create-schedule \
  --group-name candidatematch \
  --name candidatematch-match \
  --schedule-expression "cron(0 */6 * * ? *)" \
  --flexible-time-window '{"Mode":"OFF"}' \
  --target '{ ... same pattern for /api/cron/match ... }'

# Cleanup — daily 3 AM UTC
aws scheduler create-schedule \
  --group-name candidatematch \
  --name candidatematch-cleanup \
  --schedule-expression "cron(0 3 * * ? *)" \
  --flexible-time-window '{"Mode":"OFF"}' \
  --target '{ ... same pattern for /api/cron/cleanup ... }'
```

### Option C: Lightweight alternative (cron-job.org)

If you prefer not to use EventBridge, [cron-job.org](https://cron-job.org) is free and works fine:

1. Sign up and create 3 jobs.
2. For each job:
   - **URL:** `https://<your-amplify-url>/api/cron/<match|ingest|cleanup>`
   - **Method:** GET
   - **Headers:** `Authorization: Bearer <CRON_SECRET>`
   - **Intervals:** hourly / every-6-hours / daily-at-3am

---

## 3. Verify

```bash
# Manual curl test (replace URL and secret)
curl -s -H "Authorization: Bearer YOUR_CRON_SECRET" \
  https://<your-app>/api/cron/match | jq .

# Expected response shape:
# { "ok": true, "elapsed_ms": ..., "candidates_processed": ..., "total_matches_upserted": ... }

# 401 = CRON_SECRET mismatch — check for extra whitespace in the env var
```

Admin users can view cron run history at: **Admin Dashboard → Cron History** (`/api/cron/history`).

---

## Environment Variables Reference

| Variable | Required | Notes |
|---|---|---|
| `CRON_SECRET` | ✅ | Set in Amplify console; used by all three cron endpoints |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Server-only |
| `ANTHROPIC_API_KEY` | ✅ | For matching and AI features |
| `RESUME_WORKER_URL` | ✅ | URL of your deployed resume worker |
| `NEXT_PUBLIC_APP_URL` | ✅ | Your Amplify app URL (used for auth redirects) |
| `AUTOFILL_ALLOWED_ORIGINS` | ✅ prod | Comma-separated allowed origins for `/api/autofill-profile`. Falls back to `*` if unset. |
| `APIFY_API_TOKEN` | Optional | Only needed if using Apify-based scraping |
| `USE_ELITE_ATS` | Optional | Set `1` to enable Elite ATS engine (Claude Sonnet) |
