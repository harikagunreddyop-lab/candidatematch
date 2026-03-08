# Setup: RESUME_WORKER_URL & AUTOFILL_ALLOWED_ORIGINS

Step-by-step to get the two missing Amplify env vars configured.

---

## Part 1: AUTOFILL_ALLOWED_ORIGINS (2 minutes)

Use this so the `/api/autofill-profile` endpoint (e.g. for the Chrome extension) only accepts requests from your app.

### In AWS Amplify

1. Open **Amplify Console** → your app → **Environment variables** → **Manage**.
2. Click **Add variable** (or **Edit** if you prefer to add with the rest).
3. Set:
   - **Variable name:** `AUTOFILL_ALLOWED_ORIGINS`
   - **Value:**  
     - For current Amplify URL:  
       `https://master.d1zctiy8vgnlrr.amplifyapp.com`  
     - When you add a custom domain (e.g. orioncmos.com), you can change to:  
       `https://orioncmos.com`  
     - Or allow both (comma-separated, no spaces after comma):  
       `https://master.d1zctiy8vgnlrr.amplifyapp.com,https://orioncmos.com`
4. Save. **Redeploy** the app (Amplify → Redeploy this version, or push a small commit) so the new variable is picked up.

**Done.** CORS for autofill-profile will use this origin list.

---

## Part 2: Resume worker + RESUME_WORKER_URL

The resume worker is a separate Node service. The Next.js app calls it at `RESUME_WORKER_URL` for resume generation and parsing.

### Option A: Deploy worker on Railway (recommended)

**For a detailed step-by-step guide:** see **[RAILWAY_WORKER_SETUP.md](RAILWAY_WORKER_SETUP.md)**.

#### 2.1 Create Railway project

1. Go to [railway.app](https://railway.app) and sign in (GitHub is fine).
2. **New Project** → **Deploy from GitHub repo**.
3. Select the **candidatematch** repo (same repo as your Amplify app).
4. After the project is created, you’ll see a service. Don’t deploy yet.

#### 2.2 Configure the service for the worker

1. Click the service → **Settings** (or **Configure**).
2. **Root Directory:** set to `worker` (so Railway builds and runs only the `worker/` folder).
3. **Build:** Railway usually detects the Dockerfile in `worker/`. If it doesn’t, set:
   - **Builder:** Dockerfile  
   - **Dockerfile path:** `worker/Dockerfile` (or `Dockerfile` with root dir `worker`).
4. **Start command:** Leave default (Dockerfile already has `CMD ["node", "index.js"]`).

#### 2.3 Set worker environment variables

In the same service, open **Variables** (or **Environment**) and add:

| Variable | Value | Required |
|----------|--------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Same as Amplify: `https://ewmkcetafbhsjdywxgls.supabase.co` | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Same as Amplify (service role key) | Yes |
| `ANTHROPIC_API_KEY` | Same as Amplify (for resume generation) | Yes |
| `WORKER_SECRET` | A secret string, e.g. run `openssl rand -hex 24` and paste | Recommended |
| `WORKER_PORT` | `3001` | Optional (default 3001) |

**Important:** Use the **same** `WORKER_SECRET` value in both Railway (worker) and Amplify (Next.js app) so the app can call the worker securely.

#### 2.4 Deploy and get the URL

1. Trigger a deploy (e.g. **Deploy** or push a commit; with root dir `worker`, only changes in `worker/` may trigger rebuilds).
2. After deploy, open **Settings** → **Networking** → **Generate domain** (or **Public networking**). Railway will assign a URL like `https://your-service-name.up.railway.app`.
3. Copy that URL (no trailing slash). Example: `https://candidatematch-worker.up.railway.app`

#### 2.5 Set RESUME_WORKER_URL and WORKER_SECRET in Amplify

1. Amplify Console → your app → **Environment variables** → **Manage**.
2. Add:
   - **Variable:** `RESUME_WORKER_URL`  
     **Value:** the Railway worker URL (e.g. `https://candidatematch-worker.up.railway.app`) — **no trailing slash**.
   - **Variable:** `WORKER_SECRET`  
     **Value:** the same secret you set in the worker (so the app sends `X-Worker-Secret` and the worker accepts it).
3. Save and **redeploy** the app.

#### 2.6 Verify worker health

```bash
# Replace with your worker URL
curl https://YOUR-WORKER-URL.up.railway.app/health
```

Expected: `{"status":"ok","timestamp":"..."}`

If you set `WORKER_SECRET`, calling `/health` without the header is still allowed (the worker skips auth for `/health`). Other routes need `X-Worker-Secret: YOUR_WORKER_SECRET`.

---

### Option B: Deploy worker on Render

1. [render.com](https://render.com) → **New** → **Web Service**.
2. Connect the **candidatematch** GitHub repo.
3. **Root Directory:** `worker`.
4. **Environment:** Docker (Render will use `worker/Dockerfile`).
5. **Instance type:** Free or paid.
6. Add the same **environment variables** as in Option A (Supabase URL, service role key, Anthropic key, `WORKER_SECRET`, optional `WORKER_PORT`).
7. Create the service. After deploy, copy the **public URL** (e.g. `https://candidatematch-worker.onrender.com`).
8. In Amplify set `RESUME_WORKER_URL` to that URL (no trailing slash) and `WORKER_SECRET` to the same value as on the worker. Redeploy.

---

## Quick reference

| Where | Variable | Value |
|-------|----------|--------|
| **Amplify** | `AUTOFILL_ALLOWED_ORIGINS` | `https://master.d1zctiy8vgnlrr.amplifyapp.com` (or your custom domain) |
| **Amplify** | `RESUME_WORKER_URL` | Worker public URL, no trailing slash (e.g. `https://xxx.up.railway.app`) |
| **Amplify** | `WORKER_SECRET` | Same secret as on the worker (recommended) |
| **Railway/Render (worker)** | `NEXT_PUBLIC_SUPABASE_URL` | Same as Amplify |
| **Railway/Render (worker)** | `SUPABASE_SERVICE_ROLE_KEY` | Same as Amplify |
| **Railway/Render (worker)** | `ANTHROPIC_API_KEY` | Same as Amplify |
| **Railway/Render (worker)** | `WORKER_SECRET` | Same as in Amplify |

After setting these, **redeploy the Amplify app** so it uses the new env vars. Then test: log in as a candidate and trigger a “Generate resume” or tailor flow; it should call the worker and complete.
