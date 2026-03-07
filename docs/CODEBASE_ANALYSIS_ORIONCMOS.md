# CandidateMatch / OrionCMOS — Codebase Analysis

**Deployment:** https://orioncmos.com/ (AWS Amplify)  
**Generated:** From local codebase analysis (no live site crawl).

---

## 1. Tech Stack & Versions

| Item | Value |
|------|--------|
| **Framework** | Next.js 14.2.x (App Router) |
| **React** | 18.3.x |
| **Node** | 20 (Amplify: `nvm use 20`) |
| **Database** | Supabase (PostgreSQL) |
| **Auth** | Supabase Auth + `@supabase/ssr` |
| **Payments** | Stripe (candidate Pro + company subscriptions + success fees) |
| **Queue** | BullMQ + ioredis (optional; disabled when `REDIS_URL` unset) |
| **Build** | Next.js build; no custom Node version in package.json |

---

## 2. Database Schema (All Tables)

### Core (001_initial + later migrations)

- **profiles** — Extends `auth.users`. Columns: `id`, `name`, `email`, `role` (admin|recruiter|candidate), `avatar_url`, `phone`, `title`, `company`, `linkedin_url`, `specializations`, `bio`, `internal_notes`, `is_active`, `hired_count`, `timezone`, `created_at`, `updated_at`.  
  **Added later:** `company_id`, `effective_role`, `permissions`, `last_active_at` (039); `stripe_customer_id`, `subscription_tier`, `subscription_status`, `subscription_period_end`, `stripe_subscription_id` (038).

- **candidates** — Full candidate profile; `user_id` FK to profiles; `assigned_recruiter_id`; `onboarding_completed`, `approval_status`, etc.

- **recruiter_candidate_assignments** — (recruiter_id, candidate_id) PK.

- **jobs** — `id`, `source`, `source_job_id`, `title`, `company`, `location`, `url`, `jd_raw`, `jd_clean`, `dedupe_hash`, `is_active`, `scraped_at`, structured fields, etc.  
  **Added later:** `last_seen_at` (014); `ats_provider` (014); `ingest_job_id` (029); `company_id`, `posted_by`, `visibility`, `applications_count`, `views_count` (039).

- **candidate_job_matches** — candidate_id, job_id, fit_score, matched_at, score_breakdown, etc. (plus ATS columns in later migrations).

- **candidate_resumes**, **resume_versions**, **applications**, **conversations**, **conversation_participants**, **messages**, **admin_notifications**, **user_presence**, **scrape_runs**.

### Multi-tenant & RBAC (039)

- **companies** — id, name, slug, logo_url, website, industry, size_range, description, subscription_plan, subscription_status, subscription_period_end, stripe_customer_id, max_recruiters, max_active_jobs, max_candidates_viewed, max_ai_calls_per_day, owner_id, is_active, created_at, updated_at.

- **profile_roles** — VIEW: id, name, email, legacy_role, company_id, permissions, last_active_at, avatar_url, subscription_tier, subscription_status, is_active, created_at, updated_at, **effective_role** (platform_admin | company_admin | recruiter | candidate).

- **company_invitations** — company_id, invited_by, email, role (company_admin|recruiter), token, status, expires_at, accepted_at.

- **candidate_activity** — candidate_id, actor_id, company_id, job_id, event_type, payload, created_at.

- **company_analytics**, **recruiter_performance**, **platform_metrics**.

### Job ingestion (026, 034)

- **ingest_connectors** — provider (greenhouse|lever|ashby|adzuna), source_org, is_enabled, sync_interval_min, last_run_at, last_success_at, last_error.

- **ingest_jobs** — provider, source_org, source_job_id, title, location_raw, department, job_url, apply_url, description_text, description_html, posted_at, updated_at, status (open|closed), content_hash, raw_payload, first_seen_at, last_seen_at. UNIQUE(provider, source_org, source_job_id).

### Billing & success fees (040)

- **success_fee_events** — company_id, candidate_id, job_id, hired_at, amount_cents, status (pending|invoiced|paid), agreement_accepted_at, stripe_invoice_id.

- **success_fee_agreements** — company_id, candidate_id, accepted_at. UNIQUE(company_id, candidate_id).

- **company_usage** — (company_id, usage_month) PK, candidates_viewed.

### Other

- **cron_run_history** — started_at, ended_at, status, mode, candidates_processed, total_matches_upserted, error_message (014; 033 adds partial_at, candidates_skipped).

- **feature_flags** — key, value (JSONB), role.

- **candidate_hidden_jobs**, **application_status_history**, **saved_searches**, **system_metrics** (033), **autofill_field_mappings** (20260226), **board_discoveries** (027), **cron_run_history**, plus Gmail, ATS, compliance, and other feature tables.

---

## 3. User Roles and Permissions

- **Source of truth:** `profile_roles` view (effective_role) + legacy `profiles.role`.
- **Roles:**
  - **platform_admin** — Full platform access (or legacy `admin`).
  - **company_admin** — Own company only; manage team, billing, jobs, view candidate contact after agreement.
  - **recruiter** — Scoped to company and assignments; view candidate contact after agreement.
  - **candidate** — Own profile, matches, applications, resumes; extension/connect-extension and autofill APIs are candidate-only.
- **Middleware** (`src/middleware.ts`): Route prefixes mapped to allowed roles (e.g. `/dashboard/admin` → admin/platform_admin; `/dashboard/company` → admin/platform_admin/company_admin; `/dashboard/recruiter` → admin/platform_admin/company_admin/recruiter; `/dashboard/candidate` → candidate/admin/platform_admin). Connect-extension and pending-approval flows enforced.
- **API auth:** `requireApiAuth(req, { roles?: Role[], effectiveRoles?: EffectiveRole[] })`, `requireAdmin`, `requireRecruiterOrAdmin`, `canAccessCandidate`. Uses `profile_roles` for effective_role and company_id.

---

## 4. All API Routes (Purpose)

| Route | Purpose |
|-------|--------|
| **Admin** | |
| GET/POST /api/admin/calibration/rebuild | Rebuild ATS calibration |
| POST /api/admin/elite-eval | Elite eval |
| GET /api/admin/export-candidate | Export candidate |
| GET /api/admin/jobs | Admin jobs list |
| POST /api/admin/maintenance/cleanup | Manual cleanup (admin JWT) |
| POST /api/admin/maintenance/ingest | Manual ingest (admin JWT) |
| POST /api/admin/maintenance/match | Manual matching (admin JWT) |
| POST /api/admin/send-password-reset | Send password reset |
| **Applications** | |
| GET/POST /api/applications | List/create applications |
| GET /api/applications/timeline | Timeline |
| GET /api/applications/usage | Usage (used_today, limit by role) |
| **ATS** | |
| POST /api/ats/apply-decision | Apply decision |
| POST /api/ats/bullet-rewrite | Bullet rewrite |
| POST /api/ats/check | ATS check |
| POST /api/ats/check-batch | Batch ATS check |
| POST /api/ats/check-paste | Paste check |
| POST /api/ats/explain | Explain |
| POST /api/ats/interview-kit | Interview kit |
| POST /api/ats/objection-predictor | Objection predictor |
| POST /api/ats/pipeline-risk | Pipeline risk |
| **Auto-apply** | |
| GET /api/auto-apply/dry-run | Dry-run only (cron or admin) |
| **Autofill (extension)** | |
| GET /api/autofill-profile | Candidate autofill profile |
| POST /api/autofill/cover-letter | Cover letter |
| POST /api/autofill/events | Events |
| GET/POST /api/autofill/mappings | Mappings |
| GET /api/autofill/resumes | Resumes list |
| GET /api/autofill/resumes/download | Download resume |
| **Billing** | |
| POST /api/billing/checkout | Candidate Pro checkout |
| POST /api/billing/company-checkout | Company subscription checkout |
| POST /api/billing/company-portal | Stripe billing portal |
| POST /api/billing/portal | Candidate portal |
| POST /api/billing/webhook | Stripe webhook |
| **Candidate** | |
| GET /api/candidate/advice | Advice |
| GET /api/candidate/matches | Job matches (free-tier weekly limit) |
| **Companies** | |
| GET /api/companies | List companies (admin) |
| GET /api/companies/[id] | Company by id |
| POST /api/companies/agreement | Success-fee agreement |
| GET /api/companies/candidate-contact | Candidate contact (after agreement + limits) |
| POST /api/companies/hires | Mark hired + success fee checkout |
| POST /api/companies/invite | Invite to company |
| POST /api/companies/jobs | Create job (max_active_jobs enforced) |
| **Cron** | |
| GET /api/cron/cleanup | Cleanup (CRON_SECRET) |
| GET /api/cron/discovery | Discovery |
| GET /api/cron/history | Cron history |
| GET /api/cron/ingest | Ingest (sync-v2, CRON_SECRET) |
| GET /api/cron/match | Match run |
| **Connectors** | |
| GET/POST /api/connectors | Connectors CRUD |
| POST /api/connectors/[id]/sync | Single connector sync |
| POST /api/connectors/sync-all | Sync all (admin) |
| **Other** | |
| GET /api/copilot/recruiter | Copilot |
| POST /api/events | Product analytics events |
| GET /api/feature-flags, /api/feature-flags/user | Feature flags |
| POST /api/hide-job | Hide job |
| Gmail: /api/integrations/gmail/auth, callback, disconnect, status, sync | Gmail OAuth |
| POST /api/invite, /api/invite/accept-invite | Invites |
| GET /api/market/jobs, /api/market/skills | Market |
| GET /api/matches | Matches |
| POST /api/profile/ai-fill | AI fill |
| POST /api/recruiter-ai | Recruiter AI |
| POST /api/resume/analyze | Resume analyze |
| GET /api/resumes, /api/resumes/artifacts/[id] | Resumes |
| GET /api/runs, /api/runs/[id] | Runs |
| POST /api/tailor-resume | Tailor resume |
| POST /api/upload-jobs | Upload jobs |
| GET /api/candidate-brief, candidate-export, candidate-job-brief | Candidate briefs |
| GET /api/candidate-resumes | Candidate resumes |
| GET /api/compliance | Compliance |
| POST /api/discovery/run | Discovery run |

**Note:** There is **no `/api/health`** route; the guide’s `curl https://orioncmos.com/api/health` will 404 unless you add it.

---

## 5. Environment Variables Needed

**Required for build and runtime:**

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL` (e.g. https://orioncmos.com)

**Used by amplify.yml (optional write to .env.production):**

- `ANTHROPIC_API_KEY` (or `ANTHROPIC_API_KEY` — code uses both; prefer one)
- `APIFY_API_TOKEN`
- `CRON_SECRET` (for cron endpoints; if you don’t use cron, endpoints return 401 without it)
- `RESUME_WORKER_URL`
- `AUTOFILL_ALLOWED_ORIGINS`
- `GMAIL_*` (Gmail OAuth)

**Stripe:**

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRO_PRICE_ID`, `STRIPE_PRO_ANNUAL_PRICE_ID` (candidate Pro)
- Company: `STRIPE_COMPANY_STARTER_MONTHLY`, `STRIPE_COMPANY_STARTER_ANNUAL`, `STRIPE_COMPANY_PRO_*`, `STRIPE_COMPANY_ENTERPRISE_*`

**Optional:**

- `REDIS_URL` — When set, BullMQ queues enabled; otherwise queue code no-ops.
- `OPENAI_API_KEY` (semantic similarity)
- `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` (Adzuna ingest)
- `WORKER_SECRET` (resume worker)
- `ANTHROPIC_TIMEOUT_MS`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (Gmail)

---

## 6. Config Files

### amplify.yml

```yaml
version: 1
frontend:
  phases:
    preBuild:
      commands:
        - nvm use 20
        - npm ci
    build:
      commands:
        - env | grep -e NEXT_PUBLIC_ >> .env.production || true
        - env | grep -e SUPABASE_SERVICE_ROLE_KEY >> .env.production || true
        - env | grep -e ANTHROPIC_API_KEY >> .env.production || true
        - env | grep -e APIFY_API_TOKEN >> .env.production || true
        - env | grep -e CRON_SECRET >> .env.production || true
        - env | grep -e RESUME_WORKER_URL >> .env.production || true
        - env | grep -e AUTOFILL_ALLOWED_ORIGINS >> .env.production || true
        - env | grep -e NEXT_PUBLIC_APP_URL >> .env.production || true
        - env | grep -e GMAIL_ >> .env.production || true
        - npm run build
  artifacts:
    baseDirectory: .next
    files: '**/*'
  cache:
    paths:
      - node_modules/**/*
      - .next/cache/**/*
```

### next.config.js

- Security headers (X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy).
- `images.domains: []`.
- `eslint.ignoreDuringBuilds: true`, `typescript.ignoreBuildErrors: false`.
- Webpack: server externals include `canvas` (for pdf-parse).

### Auth helpers

- **src/lib/api-auth.ts** — `requireApiAuth`, `requireAdmin`, `requireRecruiterOrAdmin`, `canAccessCandidate`; uses `profile_roles` (effective_role, company_id).
- **src/lib/supabase-server.ts** — `createServerSupabase()` (cookies), `createServiceClient()` (service role).
- **src/lib/env.ts** — `getSupabasePublicEnv()`, `getSupabaseServiceKey()`, `requireEnv`, `getOptionalEnv`.
- **src/app/api/autofill/_auth.ts** — Bearer token validation for extension; candidate-only via `authedCandidateClient`.

---

## 7. Current Features Implemented

- Multi-tenant RBAC (companies, profile_roles, effective_role, company_id).
- Candidate: onboarding, matches (with free-tier weekly limit), applications, resumes, extension connect, autofill APIs.
- Recruiter/company: assignments, pipeline, candidates, messages, company dashboard, billing (Starter/Pro/Enterprise), success-fee agreement and “Mark as hired”, candidate contact view with limits.
- Platform admin: full access, cron history, maintenance endpoints (cleanup, ingest, match), job boards (ingest connectors).
- Job ingestion: sync-v2 (parallel), ingest_connectors + ingest_jobs, promote to jobs, Adzuna + Greenhouse/Lever/Ashby.
- Billing: Stripe checkout/portal/webhook for candidate Pro and company subscriptions; success fees per hire.
- ATS: check, check-batch, check-paste, apply-decision, bullet-rewrite, explain, interview-kit, objection-predictor, pipeline-risk.
- Gmail OAuth integration.
- Product analytics: `/api/events` + client `trackEvent` (no Sentry/PostHog in codebase).
- Cron: ingest, match, cleanup, discovery (auth: CRON_SECRET).

---

## 8. Issues and Gaps

1. **No `/api/health`** — Add a simple health route if you want `curl https://orioncmos.com/api/health` for monitoring.
2. **No Sentry/PostHog** — No Sentry or PostHog imports; only internal `/api/events` + `trackEvent`. Add if you want error and product analytics.
3. **CRON_SECRET** — If you don’t use EventBridge/cron, set a dummy value or document that cron endpoints will 401 without it.
4. **profile_roles view** — Depends on `subscription_tier`, `subscription_status` in profiles (038); ensure migration order (038 before 039).
5. **Company admin seeding** — New companies need `effective_role = 'company_admin'` and `company_id` set for the creating user; ensure invite/accept and company creation flows set these.
6. **Stripe company price IDs** — Company checkout reads env vars for Starter/Pro/Enterprise monthly and annual; all must be set for full billing.
7. **Lint** — Many react-hooks/exhaustive-deps and a couple no-img-element warnings; no type-check script in package.json (only `next build` which runs type-check).
8. **Optional REDIS_URL** — Queue code degrades gracefully when unset; no action needed if you don’t use workers.

---

## 9. Scenario for Your Guide

**Scenario A: Already has multi-tenancy.**  
Your codebase **does** have multi-tenancy and RBAC: `companies`, `profile_roles` (effective_role), `company_id` on profiles and jobs, company invitations, success fees, and company-scoped APIs. Use the “ADD missing enterprise features” path (monitoring, health, hardening, tests) rather than building RBAC from scratch.

---

## 10. Quick Verification Queries (Supabase SQL)

```sql
-- Tables present
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- Companies and roles
SELECT id, name, subscription_plan, subscription_status FROM companies LIMIT 5;
SELECT id, role, effective_role, company_id FROM profile_roles LIMIT 10;

-- Jobs with company linkage
SELECT id, title, company_id, posted_by, source FROM jobs LIMIT 5;
```

---

*End of analysis.*
