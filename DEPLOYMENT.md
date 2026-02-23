# CandidateMatch – Deployment Guide

This app has two parts:

1. **Next.js app** – dashboard, API routes, auth (Supabase), matching (Anthropic), scraping (Apify).
2. **Resume worker** – separate Node service (port 3001) used for resume parsing/generation. It is called by the Next.js API; it must be deployed and reachable via `RESUME_WORKER_URL`.

---

## Recommended setup: Vercel + Railway (or Render)

Best balance of simplicity, DX, and cost for most teams.

### 1. Deploy Next.js to Vercel

- Push the repo to GitHub and import the project in [Vercel](https://vercel.com).
- Framework is auto-detected (you already have `vercel.json`).
- Set **Environment Variables** in Vercel (Project → Settings → Environment Variables):

| Variable | Required | Notes |
|----------|----------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | From Supabase project |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | From Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-only; keep secret |
| `ANTHROPIC_API_KEY` | Yes | For matching |
| `APIFY_API_TOKEN` | If using scraping | From Apify |
| `RESUME_WORKER_URL` | Yes | Full URL of your deployed worker (e.g. `https://your-worker.railway.app`) |
| `NEXT_PUBLIC_APP_URL` | Yes | Your app URL (e.g. `https://master.d1zctiy8vgnlrr.amplifyapp.com`) |

- Deploy. The build runs `npm run build`; the app runs as serverless/edge.

**Matching and timeouts**

- Matching runs inside Vercel serverless functions.
- **Hobby:** function timeout 60s.
- **Pro:** function timeout 300s (5 min).
- If you run matching for many candidates/jobs and expect it to exceed 5 minutes, use **Vercel Pro** or move long-running matching to a separate worker (see “Alternative” below).

### 2. Deploy the resume worker to Railway (or Render)

The worker is a separate Node app with a Dockerfile.

**Railway**

1. Sign up at [railway.app](https://railway.app).
2. New Project → Deploy from GitHub repo (or “Empty project” and connect repo).
3. Add a **Service** and set **Root Directory** to `worker` (so only the worker folder is built).
4. Build: use **Dockerfile** (path `worker/Dockerfile`). Railway will detect it if the service root is `worker`.
5. Set **Start Command** if needed (Dockerfile already has `CMD ["node", "index.js"]`).
6. Add a **Public Domain** for the service so you get a URL like `https://your-worker.railway.app`.
7. Copy that URL and set it in Vercel as `RESUME_WORKER_URL` (no trailing slash).

**Render**

1. New → Web Service; connect repo.
2. **Root Directory:** `worker`.
3. **Environment:** Docker.
4. Render will use `worker/Dockerfile`. Assign a public URL.
5. Set `RESUME_WORKER_URL` in Vercel to that URL.

**Worker env (if needed)**

- If the worker needs any env (e.g. Supabase or API keys), add them in Railway/Render. Your current setup uses the Next.js API to call the worker, so the worker may only need to be reachable; check `worker/index.js` for any `process.env` usage.

### 3. Supabase

- Use your existing Supabase project (production).
- In Supabase → Authentication → URL Configuration, set **Site URL** to `NEXT_PUBLIC_APP_URL` and add your Vercel domain to **Redirect URLs** (e.g. `https://your-app.vercel.app/**`).

### 4. Post-deploy checks

- Open the app; log in (Supabase auth).
- As admin: upload a job, run matching (Jobs page). If matching hits time limits, consider Pro or offloading to a worker.
- As admin/recruiter: trigger an action that uses the resume worker (e.g. generate resume). Confirm `RESUME_WORKER_URL` is correct and the worker returns 200 on `/health`.

---

## Alternative: All-in-one on Railway or Render

If you prefer one platform and want to avoid serverless time limits for matching:

- **Railway / Render:** create two services from the same repo:
  1. **Web (Next.js)**  
     - Root: project root (or leave empty).  
     - Build: `npm install && npm run build`.  
     - Start: `npm run start`.  
     - Add a public domain and set **all** env vars (including `RESUME_WORKER_URL` pointing at the worker service URL).
  2. **Worker**  
     - Root: `worker`.  
     - Build/run: Docker using `worker/Dockerfile`.  
     - Add a public domain; use that URL as `RESUME_WORKER_URL` in the Next.js service.

This way both run as long-lived processes (no 5‑minute function limit).

---

## Summary

| Component      | Recommended        | Env / notes |
|----------------|--------------------|-------------|
| Next.js        | Vercel             | All env vars above; `NEXT_PUBLIC_APP_URL` = Vercel URL |
| Resume worker  | Railway or Render  | Public URL → `RESUME_WORKER_URL` in Vercel |
| DB + Auth      | Supabase (existing)| Redirect URLs for Vercel domain |
| Matching       | Runs in Next.js API| Vercel Pro if runs > 5 min; else consider worker offload |

Using **Vercel for the app** and **Railway (or Render) for the worker** is the best default setup for deploying this project.
