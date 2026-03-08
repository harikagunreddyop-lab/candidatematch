# Railway Setup — Resume Worker

Step-by-step guide to deploy the CandidateMatch resume worker on Railway.

---

## Prerequisites

- GitHub account (repo connected)
- Railway account ([railway.app](https://railway.app))
- Supabase URL, service role key, Anthropic API key

---

## Step 1: Create Railway Project

1. Go to [railway.app](https://railway.app) and sign in (GitHub recommended).
2. Click **New Project**.
3. Select **Deploy from GitHub repo**.
4. Choose your **candidatematch** repository.
5. Railway will create a project and a service. **Do not deploy yet.**

---

## Step 2: Configure Root Directory

The worker lives in the `worker/` folder. Railway must build only that folder.

1. Click your service (the one created from the repo).
2. Go to **Settings** (or the gear icon).
3. Find **Root Directory**.
4. Set it to: `worker`
5. Save.

---

## Step 3: Build & Deploy Settings

Railway should auto-detect the Dockerfile. If not:

1. **Settings** → **Build**
2. **Builder:** Dockerfile
3. **Dockerfile path:** `Dockerfile` (relative to root dir `worker`, so it’s `worker/Dockerfile`)

4. **Start command:** Leave default. The Dockerfile already has `CMD ["node", "index.js"]`.

---

## Step 4: Set Environment Variables

1. Open **Variables** (or **Environment** tab).
2. Add these variables:

| Variable | Value | Required |
|----------|-------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL (e.g. `https://xxxx.supabase.co`) | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Same as your main app | Yes |
| `ANTHROPIC_API_KEY` | Same as your main app | Yes |
| `WORKER_SECRET` | A secret string (see below) | Yes |
| `WORKER_PORT` | `3001` | Optional; Railway sets `PORT` automatically — the worker uses it |
| `REDIS_URL` | Redis URL (if using BullMQ) | Optional |

**Generate a worker secret:**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output and paste it as `WORKER_SECRET`. **Use this same value in your main app** (Next.js `.env` or Amplify env vars).

---

## Step 5: Deploy

1. Click **Deploy** (or push a commit).
2. Wait for the build to finish (usually 2–5 minutes).
3. Check the **Deployments** tab for build logs.

---

## Step 6: Generate Public URL

1. Go to **Settings** → **Networking** → **Public Networking**.
2. Click **Generate domain**.
3. Railway will assign a URL like `https://your-service-name.up.railway.app`.
4. Copy this URL (no trailing slash). Example: `https://candidatematch-worker.up.railway.app`

---

## Step 7: Add to Your Main App

1. In your main app (Amplify, Vercel, or local `.env`), add:

   ```
   RESUME_WORKER_URL=https://your-service-name.up.railway.app
   WORKER_SECRET=<same-value-as-in-railway>
   ```

2. **Redeploy** the main app so it picks up the new env vars.

---

## Step 8: Verify

```bash
# Health check (no auth)
curl https://your-service-name.up.railway.app/health
```

Expected response:

```json
{"status":"ok","timestamp":"..."}
```

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Build fails | Check Root Directory is `worker`; ensure `worker/Dockerfile` exists |
| Worker not reachable | Check **Public Networking** → domain is generated |
| 401 Unauthorized | Ensure `WORKER_SECRET` matches in both app and worker |
| Missing env vars | Check all required variables in Railway Variables tab |
| Tectonic / PDF errors | Ensure Dockerfile uses Node 20; Railway may need a larger build |

---

## Quick Reference

| Where | Variable | Value |
|-------|----------|-------|
| **Railway (worker)** | `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase URL |
| **Railway (worker)** | `SUPABASE_SERVICE_ROLE_KEY` | Service role key |
| **Railway (worker)** | `ANTHROPIC_API_KEY` | Anthropic key |
| **Railway (worker)** | `WORKER_SECRET` | Generated secret |
| **Main app** | `RESUME_WORKER_URL` | Worker public URL (no trailing slash) |
| **Main app** | `WORKER_SECRET` | Same as worker |
