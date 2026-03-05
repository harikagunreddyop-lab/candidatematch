# CandidateMatch — Deployment Guide (AWS Amplify)

This app has two parts:

1. **Next.js app** — dashboard, API routes, auth (Supabase), matching (Anthropic). Deployed on **AWS Amplify**.
2. **Resume worker** — separate Node service (port 3001) for resume parsing/generation. Called by Next.js API via `RESUME_WORKER_URL`. Deploy separately (Railway, Render, or EC2).

---

## Deploy the Next.js App to AWS Amplify

### 1. Connect the repo

1. **Amplify Console** → **New app** → **Host web app** → connect your GitHub repo.
2. Amplify auto-detects `amplify.yml` — no manual build config needed.
3. Default build settings from `amplify.yml`:
   - Pre-build: `nvm use 20 && npm ci`
   - Build: exports env vars to `.env.production`, then `npm run build`
   - Artifacts: `.next/**/*`
   - Cache: `node_modules`, `.next/cache`

### 2. Set Environment Variables

In **Amplify Console** → your app → **Environment variables**:

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | From Supabase project settings |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | From Supabase project settings |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Server-only; keep secret |
| `ANTHROPIC_API_KEY` | ✅ | For matching and AI features |
| `RESUME_WORKER_URL` | ✅ | Full URL of your deployed worker (no trailing slash) |
| `NEXT_PUBLIC_APP_URL` | ✅ | Your Amplify app URL (e.g. `https://master.d1zctiy8vgnlrr.amplifyapp.com`) |
| `CRON_SECRET` | ✅ | Secret for cron endpoint auth; generate a 32+ char random string |
| `AUTOFILL_ALLOWED_ORIGINS` | ✅ prod | Comma-separated CORS origins for `/api/autofill-profile` (e.g. `chrome-extension://xxx`) |
| `APIFY_API_TOKEN` | Optional | Only needed for Apify-based job scraping |
| `USE_ELITE_ATS` | Optional | Set `1` to enable Elite ATS engine (Claude Sonnet) |

> After adding or changing variables, redeploy via Amplify Console or a new git push.

### 3. Supabase Auth Configuration

In **Supabase** → Authentication → URL Configuration:
- **Site URL:** your `NEXT_PUBLIC_APP_URL`
- **Redirect URLs:** add `https://<your-amplify-domain>/**`

### 4. Run Database Migrations

Run all migrations in `supabase/migrations/` against your production Supabase instance:

```bash
# From project root (requires Supabase CLI)
supabase db push
# OR run each .sql file manually in the Supabase SQL editor in order.
```

### 5. Cron Scheduling (AWS EventBridge)

Amplify does not run cron jobs natively. Use **AWS EventBridge Scheduler** to call the cron endpoints.

See **[docs/CRON_AMPLIFY.md](docs/CRON_AMPLIFY.md)** for full setup instructions.

Summary of three schedules:

| Endpoint | Schedule | Purpose |
|---|---|---|
| `GET /api/cron/ingest` | Every 1 hour | Sync job connectors |
| `GET /api/cron/match` | Every 6 hours | Run matching |
| `GET /api/cron/cleanup` | Daily 03:00 UTC | Delete stale applications |

All require `Authorization: Bearer $CRON_SECRET`.

---

## Deploy the Resume Worker

The worker is a separate Node app at `worker/` with a `Dockerfile`.

### Railway (recommended)

1. **New project** → **Deploy from GitHub** → select this repo.
2. Add a **Service**, set **Root Directory** to `worker`.
3. Build: Docker (auto-detected from `worker/Dockerfile`).
4. Set env vars the worker needs (check `worker/index.js` for `process.env` usage).
5. Add a **Public Domain** → copy the URL → set it as `RESUME_WORKER_URL` in Amplify.

### Render

1. **New** → **Web Service** → connect repo.
2. **Root Directory:** `worker`, **Environment:** Docker.
3. Copy the public URL → set as `RESUME_WORKER_URL` in Amplify.

---

## Post-Deploy Checklist

```bash
# 1. Health check
curl https://<your-app>/api/cron/history \
  -H "Authorization: Bearer <CRON_SECRET>"
# Expected: 401 (needs admin session) — confirms route is up

# 2. Resume worker health
curl https://<your-worker-url>/health
# Expected: 200

# 3. Manual cron test
curl -s -H "Authorization: Bearer <CRON_SECRET>" \
  https://<your-app>/api/cron/match | jq .ok
# Expected: true
```

In the app:
- Log in as admin → Upload a job → Run matching → Confirm matches appear.
- Log in as candidate → Check matches → Run ATS check → Confirm result.

---

## Mobile (iOS / Android — optional)

The app is Capacitor-enabled. See **[docs/MOBILE_STORE_DEPLOYMENT.md](docs/MOBILE_STORE_DEPLOYMENT.md)** for native build instructions.

---

## Summary

| Component | Platform | Notes |
|---|---|---|
| Next.js app | AWS Amplify | `amplify.yml` handles build |
| Resume worker | Railway / Render | URL → `RESUME_WORKER_URL` |
| DB + Auth | Supabase | Set site URL + redirect URLs |
| Cron jobs | AWS EventBridge Scheduler | See `docs/CRON_AMPLIFY.md` |
