# Production Deployment Checklist

Use with [DEPLOYMENT.md](../DEPLOYMENT.md) and [docs/CRON_AMPLIFY.md](CRON_AMPLIFY.md). Sign off each item before go-live.

---

## Pre-deploy

| # | Task | Done |
|---|------|------|
| 1 | All Supabase migrations applied (including 042_ingest_quality_fields) | ☐ |
| 2 | Amplify env vars set: SUPABASE_*, ANTHROPIC_API_KEY, RESUME_WORKER_URL, NEXT_PUBLIC_APP_URL, CRON_SECRET, AUTOFILL_ALLOWED_ORIGINS | ☐ |
| 3 | Optional: INGEST_USE_V3=true, REDIS_URL | ☐ |
| 4 | Supabase Auth → Site URL & Redirect URLs = production URL | ☐ |
| 5 | Resume worker deployed; RESUME_WORKER_URL correct | ☐ |

---

## Cron

| # | Task | Done |
|---|------|------|
| 6 | EventBridge/cron: /api/cron/ingest (hourly) | ☐ |
| 7 | EventBridge/cron: /api/cron/match (e.g. every 6h) | ☐ |
| 8 | EventBridge/cron: /api/cron/cleanup (daily) | ☐ |
| 9 | Header: Authorization: Bearer CRON_SECRET | ☐ |
| 10 | Manual test: curl cron endpoint → 200 + JSON | ☐ |

---

## Post-deploy verification

| # | Task | Done |
|---|------|------|
| 11 | GET /api/health → 200, status healthy/degraded | ☐ |
| 12 | Resume worker /health → 200 | ☐ |
| 13 | Login platform admin → Companies, Health, Connectors OK | ☐ |
| 14 | Login company admin → Post job, Team, Billing OK | ☐ |
| 15 | Login recruiter → Jobs, Matches, Pipeline, Messages OK | ☐ |
| 16 | Login candidate → Matches, Apply, Applications, ATS OK | ☐ |
| 17 | Toasts and error/empty states work | ☐ |
| 18 | No critical console/API errors | ☐ |

---

## Sign-off

| Role | Name | Date |
|------|------|------|
| Dev | | |
| QA / Product | | |
| Deploy | | |

**Production go-live:** ☐ Approved
