# Current Deployment Analysis - orioncmos.com

**Site:** https://orioncmos.com  
**Repo:** candidatematch (Next.js on AWS Amplify)

---

## 1. Tech Stack

| Item | Value |
|------|--------|
| **Next.js** | ^14.2.0 (App Router) |
| **TypeScript** | ^5.9.3 |
| **UI framework** | Tailwind CSS ^3.4.0 |
| **Component library** | None (custom components; Lucide React ^0.400.0 for icons) |
| **State management** | React state + Context (no Redux/Zustand) |
| **Database** | Supabase (PostgreSQL) |
| **Auth** | Supabase Auth + @supabase/ssr |

---

## 2. Database & Backend

- **Database:** Supabase (PostgreSQL). All tables in `public` schema; migrations in `supabase/migrations/`.
- **Authentication:** Supabase Auth. Session via cookies; `createServerClient` in middleware and API; `createServiceClient()` for server-side service role. No NextAuth/Cognito.
- **API routes:** All under `src/app/api/` (App Router). See **Section 5** for full list.
- **External APIs used:**
  - **Anthropic (Claude)** — ATS scoring, cover letter, recruiter AI, candidate advice, bullet rewrite, explain, interview kit, objection predictor, pipeline risk, profile AI-fill, copilot, candidate brief/job brief.
  - **OpenAI** — Optional in `semantic-similarity.ts` (OPENAI_API_KEY).
  - **Stripe** — Checkout, portal, webhooks (candidate Pro + company subscriptions + success fees).
  - **Apify** — APIFY_API_TOKEN (scraping/ingest).
  - **Adzuna** — Optional job ingest (ADZUNA_APP_ID, ADZUNA_APP_KEY).
  - **Gmail** — OAuth (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET) for integrations.
  - **Resume worker** — External service (RESUME_WORKER_URL) for PDF generation.

---

## 3. File Structure

```
src/
├── app/
│   ├── api/                    # All API routes (see Section 5)
│   │   ├── admin/              # calibration, elite-eval, export-candidate, jobs, maintenance/*, send-password-reset
│   │   ├── applications/       # route, timeline, usage
│   │   ├── ats/                # apply-decision, bullet-rewrite, check, check-batch, check-paste, explain, interview-kit, objection-predictor, pipeline-risk
│   │   ├── auto-apply/         # dry-run
│   │   ├── autofill/           # cover-letter, events, mappings, resumes, resumes/download
│   │   ├── autofill-profile/   # route
│   │   ├── billing/            # checkout, company-checkout, company-portal, portal, webhook
│   │   ├── candidate/          # advice, matches
│   │   ├── companies/          # [id], agreement, candidate-contact, hires, invite, jobs
│   │   ├── connectors/         # [id]/sync, sync-all, route
│   │   ├── cron/               # cleanup, discovery, history, ingest, match
│   │   ├── integrations/gmail/ # auth, callback, disconnect, status, sync
│   │   ├── invite/             # accept-invite, route
│   │   ├── market/             # jobs, skills
│   │   ├── profile/            # ai-fill
│   │   ├── resumes/            # artifacts/[id], route
│   │   └── ... (applications, compliance, discovery, events, feature-flags, hide-job, matches, recruiter-ai, resume/analyze, runs, tailor-resume, upload-jobs, candidate-*, copilot)
│   ├── auth/                   # callback, complete, page, reset-password
│   ├── dashboard/
│   │   ├── admin/              # applications, assignments, audit, candidates/[id], companies/[id], job-boards, jobs, messages, pipeline, reports, settings, users, page, layout
│   │   ├── candidate/         # connect-extension, interviews, jobs, messages, onboarding, profile, reports, settings, skill-report, waiting, page, layout
│   │   ├── company/            # analytics, jobs, messages, settings, settings/billing, team, team/invite, page, layout
│   │   ├── recruiter/          # applications, candidates, candidates/[id], candidates/messages, integrations, jobs, messages, pipeline, reports, page, layout
│   │   └── page.tsx, layout.tsx
│   ├── pending-approval/
│   ├── pricing/
│   ├── connect-extension/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── not-found.tsx
│   ├── terms/
│   └── privacy/
├── components/
│   ├── layout/    # DashboardLayout
│   ├── ui/        # AdminNotifications, ChatComponents, FloatingChatWidget, index, ThemeToggle
│   ├── admin/     # JobBoardsPanel
│   ├── ats/       # AtsBreakdownPanel
│   ├── jobs/      # JobSearchView
│   ├── MatchingPanel.tsx
│   ├── OfferCaptureModal.tsx
│   ├── RegisterSW.tsx
│   └── ThemeProvider.tsx
├── lib/
│   ├── ai/        # anthropic, apply-decision, explainability, jd-intelligence, objection-predictor, placement-probability, pipeline-risk, resume-evidence-analyzer, resume-rewriter, index
│   ├── calibration/  # isotonic
│   ├── api-auth.ts
│   ├── auth.ts
│   ├── env.ts
│   ├── supabase-server.ts
│   ├── supabase-browser.ts
│   ├── security.ts
│   ├── rate-limit.ts
│   ├── redis.ts
│   ├── logger.ts
│   ├── analytics.ts
│   ├── usage-limits.ts
│   ├── plan-limits.ts
│   ├── matching.ts
│   ├── ats-engine.ts
│   ├── elite-ats-engine.ts
│   ├── cleanup.ts
│   ├── feature-flags-server.ts
│   ├── gmail-oauth.ts
│   ├── resume-content.ts
│   ├── ... (audit, ats-scorer, ats-score, fix-report, job-structure--extractor, resume-intelligence, semantic-similarity, skill-*, telemetry, etc.)
│   └── *.test.ts
├── ingest/        # sync-v2, promote, promote-v2, queue, adapters/* (ashby, lever, greenhouse, adzuna, types, index)
├── queue/         # workers (tailor, render, score, match), redis
├── discovery/     # discover, validate
├── middleware.ts
└── types (if any)
```

---

## 4. Database Schema

### Tables (from migrations)

**Core (001):**  
profiles, candidates, recruiter_candidate_assignments, jobs, candidate_job_matches, candidate_resumes, resume_versions, applications, scrape_runs, conversations, conversation_participants, messages, admin_notifications, user_presence

**Later additions:**  
candidate_saved_jobs, application_reminders (003); application_status_history (004); audit_log, app_settings (005); consent_records, data_deletion_requests, data_retention_policies (008); feature_flags, candidate_hidden_jobs, cron_run_history, saved_searches (014); ingest_connectors, ingest_jobs (026); board_discoveries (027); companies, company_invitations, candidate_activity, company_analytics, recruiter_performance, platform_metrics (039); success_fee_events, success_fee_agreements, company_usage (040); events (033); application_field_mappings, application_fill_events (20260226); gmail_connections, email_activity (024); ats_events (019); scoring_runs, calibration_curves, resume_embeddings, jd_embeddings, variant_outcomes, ai_cost_ledger (020); candidate_skill_index, job_skill_index (030); skill_nodes, skill_edges, talent_nodes, talent_edges, match_events, market_skill_trends, recruiter_metrics, candidate_vectors, job_vectors, skill_vectors, system_metrics (031); application_runs, run_steps, application_outcomes (035); resume_artifacts (036); human_review_requests (023); user_feature_flags (017); etc.

**Key relationships:**  
- profiles.id → auth.users(id). profiles.role (legacy), company_id, effective_role.  
- candidates.user_id → profiles(id); candidates.assigned_recruiter_id → profiles(id).  
- jobs.company_id → companies(id), jobs.posted_by → profiles(id), jobs.ingest_job_id → ingest_jobs(id).  
- candidate_job_matches (candidate_id → candidates, job_id → jobs).  
- applications (candidate_id, job_id).  
- companies: stripe_customer_id, subscription_plan, max_* limits.  
- profile_roles: VIEW over profiles with effective_role (platform_admin | company_admin | recruiter | candidate).

**RLS:**  
- Enabled on: profiles, candidates, jobs, candidate_job_matches, candidate_resumes, resume_versions, applications, conversations, conversation_participants, messages, companies, company_invitations, candidate_activity, company_analytics, recruiter_performance, platform_metrics, success_fee_events, success_fee_agreements, company_usage, cron_run_history, ingest_connectors (admin read), etc.  
- Policies use `auth.uid()`, `get_effective_role()`, `get_user_company()`, `is_platform_admin()`, `is_company_admin_or_above()` (SECURITY DEFINER functions).  
- Examples: platform_admin all access on companies/metrics; company members read/update own company; candidates own data; recruiters by assignment.

---

## 5. User Roles & Permissions

**Roles:**  
- **platform_admin** (or legacy **admin**) — Full platform; all companies, cron, admin dashboard.  
- **company_admin** — Own company only; team, billing, jobs, success-fee agreement, candidate contact.  
- **recruiter** — Scoped to company and recruiter_candidate_assignments; candidate contact after agreement.  
- **candidate** — Own profile, matches, applications, resumes; connect-extension and autofill APIs restricted to candidates.

**Auth handling:**  
- Supabase Auth (email/password; OAuth if configured).  
- Trigger `handle_new_user()` creates profile with role from invite metadata.  
- Middleware: `src/middleware.ts` — protects `/dashboard/*`, `/pending-approval`, `/connect-extension`; redirects by `profile_roles.effective_role`/legacy role; candidate onboarding/waiting flow.  
- API: `requireApiAuth(req, { roles?, effectiveRoles? })`, `requireAdmin`, `requireRecruiterOrAdmin`, `canAccessCandidate` in `src/lib/api-auth.ts`.  
- Autofill: `authedCandidateClient` in `src/app/api/autofill/_auth.ts` enforces candidate-only for extension.

**RBAC:**  
- Dashboard route prefixes mapped to allowed roles (e.g. `/dashboard/admin` → admin/platform_admin).  
- Company-scoped APIs use `auth.profile.company_id` and RLS.  
- Success-fee agreement and `max_candidates_viewed` enforced in `/api/companies/candidate-contact`.  
- `max_active_jobs` enforced in `/api/companies/jobs`.

---

## 6. API Routes (Complete List)

| Method | Route | Purpose |
|--------|--------|--------|
| GET/POST | /api/admin/calibration/rebuild | Rebuild ATS calibration |
| POST | /api/admin/elite-eval | Elite ATS eval |
| GET | /api/admin/export-candidate | Export candidate data |
| GET | /api/admin/jobs | Admin jobs list |
| POST | /api/admin/maintenance/cleanup | Manual cleanup (admin JWT) |
| POST | /api/admin/maintenance/ingest | Manual ingest (admin JWT) |
| POST | /api/admin/maintenance/match | Manual matching (admin JWT) |
| POST | /api/admin/send-password-reset | Send password reset email |
| GET/POST | /api/applications | List/create applications |
| GET | /api/applications/timeline | Application timeline |
| GET | /api/applications/usage | Usage (used_today, limit) |
| POST | /api/ats/apply-decision | Apply decision (AI) |
| POST | /api/ats/bullet-rewrite | Bullet rewrite (AI) |
| POST | /api/ats/check | ATS check |
| POST | /api/ats/check-batch | Batch ATS check |
| POST | /api/ats/check-paste | ATS check (pasted text) |
| POST | /api/ats/explain | ATS explain |
| POST | /api/ats/interview-kit | Interview kit (AI) |
| POST | /api/ats/objection-predictor | Objection predictor (AI) |
| POST | /api/ats/pipeline-risk | Pipeline risk (AI) |
| GET | /api/auto-apply/dry-run | Dry-run only (cron/admin) |
| GET | /api/autofill-profile | Candidate autofill profile (extension) |
| POST | /api/autofill/cover-letter | Cover letter (AI) |
| POST | /api/autofill/events | Autofill events |
| GET/POST | /api/autofill/mappings | Field mappings |
| GET | /api/autofill/resumes | Resumes list |
| GET | /api/autofill/resumes/download | Download resume |
| POST | /api/billing/checkout | Candidate Pro checkout |
| POST | /api/billing/company-checkout | Company subscription checkout |
| POST | /api/billing/company-portal | Stripe billing portal (company) |
| POST | /api/billing/portal | Candidate Stripe portal |
| POST | /api/billing/webhook | Stripe webhook |
| GET | /api/candidate/advice | Candidate advice (AI) |
| GET | /api/candidate/matches | Job matches (free-tier limit) |
| GET | /api/companies | List companies (admin) |
| GET | /api/companies/[id] | Company by id |
| POST | /api/companies/agreement | Success-fee agreement |
| GET | /api/companies/candidate-contact | Candidate contact (after agreement) |
| POST | /api/companies/hires | Mark hired + success fee |
| POST | /api/companies/invite | Invite to company |
| POST | /api/companies/jobs | Create job (limit enforced) |
| GET | /api/connectors | Connectors list |
| POST | /api/connectors | Create connector |
| POST | /api/connectors/[id]/sync | Sync one connector |
| POST | /api/connectors/sync-all | Sync all (admin) |
| GET | /api/copilot/recruiter | Recruiter copilot (AI) |
| GET | /api/cron/cleanup | Cleanup (CRON_SECRET) |
| GET | /api/cron/discovery | Discovery cron |
| GET | /api/cron/history | Cron history |
| GET | /api/cron/ingest | Ingest (CRON_SECRET) |
| GET | /api/cron/match | Match cron |
| POST | /api/events | Product analytics events |
| GET | /api/feature-flags | Feature flags (admin) |
| GET | /api/feature-flags/user | User feature flags |
| POST | /api/hide-job | Hide job (candidate) |
| GET | /api/integrations/gmail/auth | Gmail OAuth start |
| GET | /api/integrations/gmail/callback | Gmail OAuth callback |
| POST | /api/integrations/gmail/disconnect | Disconnect Gmail |
| GET | /api/integrations/gmail/status | Gmail status |
| POST | /api/integrations/gmail/sync | Gmail sync |
| POST | /api/invite | Create invite |
| GET | /api/invite/accept-invite | Accept invite |
| GET | /api/market/jobs | Market jobs |
| GET | /api/market/skills | Market skills |
| GET | /api/matches | Matches |
| POST | /api/profile/ai-fill | Profile AI fill |
| POST | /api/recruiter-ai | Recruiter AI |
| POST | /api/resume/analyze | Resume analyze |
| GET | /api/resumes | Resumes |
| GET | /api/resumes/artifacts/[id] | Resume artifact |
| GET | /api/runs | Runs list |
| GET | /api/runs/[id] | Run by id |
| POST | /api/tailor-resume | Tailor resume |
| POST | /api/upload-jobs | Upload jobs (admin) |
| GET | /api/candidate-brief | Candidate brief (AI) |
| GET | /api/candidate-export | Candidate export |
| GET | /api/candidate-job-brief | Job brief (AI) |
| GET | /api/candidate-resumes | Candidate resumes |
| GET | /api/compliance | Compliance |
| POST | /api/discovery/run | Discovery run |

**Missing:** `/api/health` (recommended for Amplify/monitoring).

---

## 7. Environment Variables

**From .env.example + code:**

**Required (build/runtime):**  
- NEXT_PUBLIC_SUPABASE_URL  
- NEXT_PUBLIC_SUPABASE_ANON_KEY  
- SUPABASE_SERVICE_ROLE_KEY  
- NEXT_PUBLIC_APP_URL  

**Stripe:**  
- STRIPE_SECRET_KEY  
- STRIPE_WEBHOOK_SECRET  
- STRIPE_PRO_PRICE_ID  
- STRIPE_PRO_ANNUAL_PRICE_ID  
- STRIPE_COMPANY_STARTER_MONTHLY, STRIPE_COMPANY_STARTER_ANNUAL  
- STRIPE_COMPANY_PRO_MONTHLY, STRIPE_COMPANY_PRO_ANNUAL  
- STRIPE_COMPANY_ENTERPRISE_MONTHLY, STRIPE_COMPANY_ENTERPRISE_ANNUAL  

**AI / external:**  
- ANTHROPIC_API_KEY  
- ANTHROPIC_TIMEOUT_MS (optional)  
- APIFY_API_TOKEN  
- OPENAI_API_KEY (optional, semantic-similarity)  
- ADZUNA_APP_ID, ADZUNA_APP_KEY (optional)  

**Cron / workers:**  
- CRON_SECRET  
- RESUME_WORKER_URL  
- WORKER_SECRET  
- AUTOFILL_ALLOWED_ORIGINS  

**Gmail:**  
- GOOGLE_CLIENT_ID  
- GOOGLE_CLIENT_SECRET  

**Optional:**  
- REDIS_URL (rate limit + BullMQ; in-memory fallback if unset)  
- INGEST_ITEM_CONCURRENCY, INGEST_CONNECTOR_CONCURRENCY, INGEST_UPSERT_BATCH_SIZE  
- DEBUG_MATCHING  
- NODE_ENV  

---

## 8. Current Features

- **Multi-tenant RBAC:** Companies, profile_roles, company_id on jobs/profiles, invitations.  
- **Job posting/management:** Jobs table; company jobs via /api/companies/jobs; ingest from Greenhouse/Lever/Ashby/Adzuna.  
- **Candidate matching:** candidate_job_matches; cron match; free-tier weekly limit; ATS scoring.  
- **ATS integrations:** Greenhouse, Lever, Ashby (ingest); ATS check/check-batch/check-paste, explain, interview kit, objection predictor, pipeline risk.  
- **Resume parsing:** candidate_resumes, resume_versions, resume/analyze, tailor-resume, resume worker.  
- **Email:** Gmail OAuth; invite emails (TODO: provider not wired in companies/invite).  
- **Analytics:** /api/events + trackEvent (client); system_metrics; company_analytics; recruiter_performance; platform_metrics.  
- **Payment/subscriptions:** Stripe checkout/portal/webhook; candidate Pro (monthly/annual); company Starter/Pro/Enterprise; success fees per hire; agreement gate for candidate contact.  
- **Chrome extension:** Autofill profile, mappings, events, cover letter, resumes (candidate-only).  
- **Cron:** Ingest (sync-v2), match, cleanup, discovery (CRON_SECRET).  

---

## 9. Dependencies

**Production:**  
- next ^14.2.0, react ^18.3.0, react-dom ^18.3.0  
- @supabase/ssr ^0.5.0, @supabase/supabase-js ^2.45.0, @supabase/auth-helpers-nextjs ^0.10.0  
- tailwindcss ^3.4.0, postcss ^8.4.0, autoprefixer ^10.4.0  
- lucide-react ^0.400.0, recharts ^3.7.0  
- bullmq ^5.70.2, ioredis ^5.10.0  
- p-map ^7.0.4, lodash ^4.17.23  
- date-fns ^3.6.0, docx ^9.6.0, xlsx ^0.18.5  
- unpdf ^1.4.0, crypto-js ^4.2.0, dotenv ^17.3.1  
- @capacitor/* ^6.0.0  

**Dev:**  
- typescript ^5.9.3, eslint ^8.0.0, eslint-config-next ^14.2.0  
- @types/node ^20.0.0, @types/react ^18.3.0, @types/lodash ^4.17.24, @types/chrome ^0.1.37  
- vitest ^2.1.9, esbuild ^0.27.3  

**Consider updating:**  
- eslint 8.x (warnings for deprecated deps); unpdf (critical dependency warning in build).  

---

## 10. Deployment Setup (AWS Amplify)

- **Build command:** `npm run build` (after preBuild).  
- **Output:** Next.js default (.next); artifacts baseDirectory: `.next`, files: `**/*`.  
- **Node version:** 20 (`nvm use 20`).  
- **PreBuild:** `npm ci`. Env vars written to `.env.production` via `env | grep -e ...` (NEXT_PUBLIC_*, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY, APIFY_API_TOKEN, CRON_SECRET, RESUME_WORKER_URL, AUTOFILL_ALLOWED_ORIGINS, NEXT_PUBLIC_APP_URL, GMAIL_*).  
- **Cache:** node_modules/**/*, .next/cache/**/*.  

**amplify.yml:**

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

**next.config.js:**  
Security headers (X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy); images.domains: []; eslint.ignoreDuringBuilds: true; typescript.ignoreBuildErrors: false; webpack server externals: canvas.

---

## 11. Issues & Technical Debt

- **TODO:** `src/app/api/companies/invite/route.ts` — “TODO: send email via your provider (Resend / Postmark / SendGrid)”.  
- **`as any` / type safety:** Many uses in matching.ts, dashboard pages (candidate, recruiter, admin), API routes (cover-letter, profile/ai-fill, feature-flags, ats), and tests. Reduces type safety.  
- **No Zod (or schema) validation:** Request bodies and query params validated ad hoc; no central request validation.  
- **Missing /api/health:** No health endpoint for load balancer or monitoring.  
- **Stripe company price IDs:** Must be set in Amplify env for company checkout (not in .env.example).  
- **CRON_SECRET:** If cron is not used, endpoints return 401; document or provide dummy value.  
- **Lint:** Many react-hooks/exhaustive-deps warnings; a few @next/next/no-img-element. eslint.ignoreDuringBuilds: true hides lint failures in build.  
- **Tests:** Only a few unit tests (e.g. security.test, matching-title-compat.test, ats-scorer-v2.test, job-url.test). No API or E2E test suite.  
- **Error handling:** Some routes return generic messages; NODE_ENV=development used to expose detail (e.g. tailor-resume).  
- **Company invite email:** Invitation created but email not sent (see TODO above).

---

## 12. Performance

- **Database:** Indexes on roles, company_id, ingest_jobs (provider, source_org, status), jobs (dedupe_hash, ingest_job_id), candidate_job_matches, applications, etc.  
- **API caching:** No explicit HTTP caching headers on API routes.  
- **Rate limiting:** `src/lib/rate-limit.ts` — Redis or in-memory; presets: auth (10/min), api (120/min), ats (20/min), admin_heavy (10/min). Used on autofill-profile, ats/check*, applications, invite, companies, events, runs, tailor-resume, upload-jobs.  
- **Images:** next.config images.domains: [] (no external domains); some pages use `<img>` (warnings suggest next/image).  
- **Code splitting:** Next.js automatic; no explicit bundle analysis in scripts.  
- **Ingest:** sync-v2 uses p-map concurrency (50 items, 10 connectors), lodash chunk (1000) for batch upserts.

---

## 13. Security

- **Input validation:** No Zod/schema lib; manual checks in places. Risk of invalid/malicious input on some endpoints.  
- **SQL:** Supabase client (parameterized); no raw SQL in app. RLS enforces row-level access.  
- **XSS:** React escaping; security headers (X-Content-Type-Options, etc.).  
- **CSRF:** Same-site cookies; state-changing APIs require auth (session/Bearer).  
- **Rate limiting:** Present on selected routes (see Section 12).  
- **Auth:** Supabase JWT; CRON_SECRET for cron; requireApiAuth/requireAdmin on protected APIs.  
- **Secrets:** Env vars; no secrets in client code. Stripe webhook verifies signature.  
- **CORS:** Autofill APIs check AUTOFILL_ALLOWED_ORIGINS.

---

## 14. Recommendations

1. **Add `/api/health`** — Return 200 + optional DB ping for Amplify and monitoring.  
2. **Document env vars** — Extend .env.example with all Stripe company price IDs and optional vars; align Amplify env with build.  
3. **Wire company invite email** — Implement sending (Resend/Postmark/SendGrid) in companies/invite.  
4. **Introduce request validation** — Use Zod (or similar) for API body/query and centralize validation.  
5. **Reduce `as any`** — Add types/interfaces for matching, dashboard payloads, and API responses.  
6. **Enable lint in build** — Set eslint.ignoreDuringBuilds: false and fix or narrow rules so builds fail on lint errors.  
7. **Add healthcheck in Amplify** — Point to /api/health if you add it.  
8. **Optional: Sentry/PostHog** — For errors and product analytics.  
9. **Tests** — Add API integration tests for critical routes (auth, billing, companies, candidate matches).  
10. **Stripe webhook idempotency** — Ensure webhook handler is idempotent for duplicate events.

---

*End of deployment analysis.*
