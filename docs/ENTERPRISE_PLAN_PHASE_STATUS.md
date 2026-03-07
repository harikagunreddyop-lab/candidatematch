# Enterprise Plan vs Current Codebase — Phase Status

**Plan:** 8-phase “ULTIMATE CURSOR AI PROMPT” (Multi-tenant RBAC → Auth → Monitoring → Amplify → API → Security → Testing → Deployment)

**Summary:** Phases 1 and 2 are **done in an alternative way** (profiles + profile_roles, no `users` table). Phase 4 is partially done. Phases 3, 5–8 are either not done or only partly aligned with the plan.

---

## Phase 1: Multi-Tenant RBAC Database

| Plan | Current codebase |
|------|------------------|
| `companies` with slug, company_size, search_vector | `companies` exists (039); Phase 1 added trial_ends_at, settings, created_by (041) |
| `users` table (id → auth.users, role, company_id, candidate_id) | **No `users` table.** Role/company from `profiles` + **`profile_roles`** view (039) |
| `jobs` with company_id, created_by, visibility | Yes (039/041); also `posted_by` (profiles) |
| `company_invitations` | Yes (039) |
| `activity_log` with user_id → users(id) | **`activity_log`** (041) with user_id → **profiles(id)** |
| RLS using `users` table | RLS uses **`get_effective_role()`**, **`get_user_company()`**, **`is_platform_admin()`** (profile_roles) |
| `matches` table | **`candidate_job_matches`** (not renamed to `matches`) |
| auth.user_role(), auth.user_company_id() | **public.get_effective_role()**, **public.get_user_company()** (039) |

**Verdict:** ✅ **Phase 1 done (Option B / additive).** You already verified (PHASE1_VERIFICATION_QUERIES.sql, activity_log + jobs policies). Do **not** run the plan’s Phase 1 SQL as-is — it would create a conflicting `users` table and different RLS.

---

## Phase 2: Auth Helpers & Type Safety

| Plan | Current codebase |
|------|------------------|
| `lib/auth-helpers.ts` (getCurrentUser from `users`, requireRole, canEditJob) | **Not present.** Auth is in **`lib/auth.ts`** (getProfileWithRole from **profile_roles**) and **`lib/api-auth.ts`** (requireApiAuth). |
| **`lib/auth-context.ts`** (AuthContext, isPlatformAdmin, requireCompanyId) | ✅ **Done** (Phase 2 we added) |
| Zod schemas in `lib/schemas.ts` | **Not present.** Types in **`src/types/index.ts`** (no Zod). |
| createServerComponentClient (auth-helpers-nextjs) | Not used. **createServerSupabase()** (cookies) + **profile_roles** used instead. |
| Typed dashboard profile (effective_role, company_id) | ✅ **DashboardProfile**, requireAuth returns ProfileWithRole |

**Verdict:** ✅ **Phase 2 done in our way.** No `users` table, so no plan-style auth-helpers; we use profile_roles + auth-context + existing auth.ts / api-auth.ts.

---

## Phase 3: Monitoring & Analytics (Free Tiers)

| Plan | Current codebase |
|------|------------------|
| Sentry (@sentry/nextjs) | ✅ **Installed.** Optional: set `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_DSN`. Config: sentry.client.config.ts, sentry.server.config.ts, sentry.edge.config.ts; next.config wrapped with withSentryConfig. |
| PostHog (posthog-js, lib/analytics.ts) | ❌ **Not added.** Custom analytics (`/api/events`) kept as-is. |
| Upstash Redis (lib/redis.ts, lib/ratelimit.ts) | ❌ **Not added.** Existing **ioredis** (REDIS_URL) and rate-limit kept. |
| Health check `/api/health` (DB + Redis) | ✅ **Added.** GET /api/health checks DB; optional Redis when REDIS_URL set. Returns status healthy/degraded/unhealthy. |

**Verdict:** ❌ **Phase 3 not done** per plan. You have custom analytics and ioredis; no Sentry, PostHog, Upstash, or health endpoint.

---

## Phase 4: AWS Amplify Configuration

| Plan | Current codebase |
|------|------------------|
| amplify.yml (backend + frontend, npm ci, build) | ✅ **amplify.yml** exists (frontend only, nvm 20, npm ci, env grep, npm run build) |
| next.config: output: 'standalone' | ✅ **Optional:** set `BUILD_STANDALONE=true` to enable. |
| next.config: Sentry withSentryConfig | ✅ **Done.** withSentryConfig(nextConfig, { silent: true }). |
| public/_headers, public/_redirects | ✅ **Added.** public/_headers (security + cache); public/_redirects (optional www redirect comment). |
| GitHub Actions cron (job-ingestion, health-check) | ✅ **Added.** .github/workflows/job-ingestion.yml (every 6h + dispatch), health-check.yml (hourly + dispatch). Use secrets.CRON_SECRET and vars.APP_URL. |

**Verdict:** ⚠️ **Phase 4 partially done.** amplify.yml exists and works; plan’s standalone, Sentry, _headers/_redirects, and GitHub Actions are not done.

---

## Phase 5: API Routes (RBAC-Enabled)

| Plan | Current codebase |
|------|------------------|
| POST/GET /api/cron/ingest (CRON_SECRET, syncAllConnectors) | ✅ **GET /api/cron/ingest** (validateCronAuth, sync-v2) |
| GET/PATCH /api/company (auth-helpers, users table) | **Different:** **/api/companies**, **/api/companies/[id]** (requireApiAuth, profile_roles) |
| POST /api/company/invite (InviteUserSchema, users) | ✅ **/api/companies/invite** (and accept-invite); uses profile_roles |
| GET/POST /api/jobs (JobSearchSchema, cached, userRateLimit) | **Different:** jobs via **/api/companies/jobs**, **/api/market/jobs**, etc.; no Zod; rate limit exists elsewhere |

**Verdict:** ⚠️ **Phase 5 done in spirit, different shape.** RBAC and company/job/invite flows exist; auth and schema follow profile_roles, not `users` or plan’s Zod/Redis caching.

---

## Phases 6–8 (Plan)

- **Phase 6:** Security & input sanitization — ✅ **Added** `lib/sanitize.ts` (sanitizeString, sanitizePlainText, sanitizeRequiredString, sanitizeEmail, sanitizeStringRecord). Used in POST /api/companies/jobs for title, company, location, url, jd_raw.
- **Phase 7:** Testing setup — ✅ **Existing** Vitest config and tests; **added** `src/lib/sanitize.test.ts` (10 tests). All 107 tests pass.
- **Phase 8:** Deployment verification — ✅ **Added** `docs/DEPLOYMENT_VERIFICATION.md` (checklist for build, env, health, auth, cron, extension, security headers, Sentry, GitHub Actions).

---

## How Many Phases Are “Done”?

| Phase | Status |
|-------|--------|
| **1** | ✅ Done (additive Option B: profiles + profile_roles, activity_log, jobs RLS) |
| **2** | ✅ Done (auth-context, typed dashboard, profile_roles; no users/Zod) |
| **3** | ❌ Not done (no Sentry, PostHog, Upstash, /api/health) |
| **4** | ⚠️ Partial (amplify.yml yes; standalone, Sentry, _headers/_redirects, GH Actions no) |
| **5** | ⚠️ Done in spirit (APIs exist; different auth/schema/caching) |
| **6–8** | ❌ Not done |

**Bottom line:** **2 phases fully done (1 and 2),** 2 partially done (4 and 5), **4 not done (3, 6, 7, 8).** Do not run the plan’s Phase 1 SQL verbatim — it would conflict with your existing schema (users vs profiles/profile_roles, matches vs candidate_job_matches).

**Update (post-implementation):** Phase 3 (Sentry + /api/health), Phase 4 (standalone opt-in, _headers, _redirects, GitHub Actions), Phase 6 (sanitize lib + jobs route), Phase 7 (sanitize tests), and Phase 8 (DEPLOYMENT_VERIFICATION.md) have been implemented. PostHog and Upstash were not added; existing analytics and ioredis retained.
