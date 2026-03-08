# Quick-Start Deployment Checklist

**Execute this to get to production fast.**

**Time required:** 3–4 hours  
**Goal:** CandidateMatch live on orioncmos.com

---

## Phase 1: Local verification (~15 min)

```bash
# In your CandidateMatch repo directory
cd d:\op\projects\candidatematch   # or /path/to/candidatematch

# 1. Install dependencies
npm install

# 2. Build the app (includes TypeScript check)
npm run build

# Optional: type-check only (no build)
npm run type-check
```

**Pass criteria:** Build finishes with no errors.

**If it fails:** Fix any TypeScript or build errors before continuing.

---

## Phase 2: Supabase prep (~30 min)

### A. Backup current database

1. Supabase Dashboard → **Settings** → **Database**
2. Create a backup and download it (keep it safe).

### B. Apply migrations

Migration **042** adds quality fields to **ingest_jobs** (not `jobs`). In Supabase SQL Editor:

```sql
-- Check if migration 042 is already applied on ingest_jobs:
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'ingest_jobs'
  AND column_name IN ('quality_score', 'quality_flags', 'is_spam', 'rejection_reason');

-- If fewer than 4 rows, run the contents of supabase/migrations/042_ingest_quality_fields.sql
-- (ALTER TABLE public.ingest_jobs ADD COLUMN IF NOT EXISTS ...)
```

Or run all migrations in order via Supabase CLI: `supabase db push` (after `supabase link`).

### C. Verify RLS

```sql
-- Example: company isolation (run as a company user or via service role with context)
SELECT * FROM companies
WHERE id IN (
  SELECT company_id FROM profile_roles WHERE id = auth.uid()
);
-- Should return only that user's company.
```

**Pass criteria:** 042 applied (or already present), RLS behaves as expected.

---

## Phase 3: AWS Amplify env vars (~20 min)

Use these **exact** variable names (the app expects them):

| Variable | Required | Notes |
|----------|----------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | e.g. `https://YOUR-PROJECT.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | From Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | **Secret** – server only |
| `ANTHROPIC_API_KEY` | Yes | **Secret** – e.g. `sk-ant-...` |
| `RESUME_WORKER_URL` | Yes | Full URL of resume worker (no trailing slash) — see [Setup: Resume worker & AUTOFILL](SETUP_RESUME_WORKER_AND_AUTOFILL.md) |
| `NEXT_PUBLIC_APP_URL` | Yes | `https://orioncmos.com` |
| `CRON_SECRET` | Yes | e.g. `openssl rand -hex 32` |
| `AUTOFILL_ALLOWED_ORIGINS` | Yes (prod) | `https://orioncmos.com` (or comma-separated list) — see [Setup: Resume worker & AUTOFILL](SETUP_RESUME_WORKER_AND_AUTOFILL.md) |
| `INGEST_USE_V3` | Optional | Set `true` for quality/scam filtering |

**Steps:**

1. AWS Amplify Console → your app → **Environment variables** → **Manage**
2. Add each variable above
3. Save and redeploy if needed

**Pass criteria:** All required variables set with correct names.

---

## Phase 4: Supabase Auth (~10 min)

1. Supabase Dashboard → **Authentication** → **URL Configuration**
2. **Site URL:** `https://orioncmos.com`
3. **Redirect URLs** – add:
   - `https://orioncmos.com/**`
   - `https://orioncmos.com/auth/callback`
4. Save

**Pass criteria:** Site URL and redirect URLs match production.

---

## Phase 5: Deploy (~30 min)

```bash
# 1. Commit and push (use your actual branch: main or master)
git add .
git status
git commit -m "Production deployment - post rebuild"
git push origin main
# If your default branch is master: git push origin master
```

2. Amplify will build and deploy (typically 5–10 min).  
3. Watch **Amplify Console** → Build and deploy progress.

**Pass criteria:** Build and deploy succeed; site is reachable at orioncmos.com.

---

## Phase 6: Quick verification (~20 min)

### Health and homepage

```bash
# Health check
curl https://orioncmos.com/api/health
# Expected: 200 and JSON with "status": "healthy" or "degraded"

# Homepage
# Open https://orioncmos.com in a browser – should load.
```

### Role checks

- [ ] **Platform admin** – sees Companies, MRR, system health
- [ ] **Company admin** – sees only their company
- [ ] **Recruiter** – sees only their jobs
- [ ] **Candidate** – sees Matches and can use flows

**Pass criteria:** All four roles work; no critical console errors.

---

## Phase 7: Cron (can be done later)

Cron ingest uses **GET** (not POST) and **Bearer** auth. Optional for first launch.

```bash
# Generate secret if needed
openssl rand -hex 32

# Test ingest (replace YOUR_CRON_SECRET and orioncmos.com)
curl -s -H "Authorization: Bearer YOUR_CRON_SECRET" \
  "https://orioncmos.com/api/cron/ingest"
# Expected: 200 and JSON with success, connectors, fetched, upserted, etc.
```

**EventBridge (later):**

- Ingest: hourly → `GET /api/cron/ingest`
- Match: every 6h → `GET /api/cron/match`
- Cleanup: daily → `GET /api/cron/cleanup`

Details: **docs/CRON_AMPLIFY.md**.

---

## You’re live checklist

**Minimum for “we’re live”:**

- [ ] Build succeeds locally
- [ ] Migrations applied (including 042 on `ingest_jobs`)
- [ ] Amplify env vars set (correct names)
- [ ] Supabase Auth URLs set for orioncmos.com
- [ ] Code pushed and Amplify deploy successful
- [ ] Site loads at orioncmos.com
- [ ] All four roles work
- [ ] No critical errors in browser console
- [ ] Cron (optional now; set up later)
- [ ] Monitoring (optional; set up later)

When the first 8 are done, you’re live.

---

## Quick troubleshooting

| Issue | What to try |
|-------|-------------|
| **Build fails** | `rm -rf node_modules package-lock.json` then `npm install` and `npm run build` |
| **DB/auth errors** | Confirm `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` in Amplify match Supabase; redeploy |
| **Auth redirect errors** | Check Supabase Auth Site URL and Redirect URLs; clear browser cache |
| **Dashboard not visible** | In Supabase check `profile_roles` (role, effective_role, company_id) for that user |
| **TypeScript errors** | Fix locally; `npm run build` runs type-check; then push again |

---

## Support and next steps

- **Detailed deploy:** DEPLOYMENT.md  
- **Cron setup:** docs/CRON_AMPLIFY.md  
- **Pre-launch checklist:** docs/DEPLOYMENT_CHECKLIST.md  
- **Testing:** docs/TESTING_REPORT.md  

**After go-live:** Monitor for 24h, fix issues, add cron if skipped, then monitoring/alerts and first customers.
