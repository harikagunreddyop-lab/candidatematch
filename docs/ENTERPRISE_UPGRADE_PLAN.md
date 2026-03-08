# CandidateMatch — Enterprise Grade Upgrade Plan

**Generated:** March 8, 2026  
**Current Status:** ⚠️ Functional but not enterprise ready  
**Target:** 🏆 Elite enterprise-grade SaaS platform  
**Severity:** HIGH — Multiple critical issues requiring attention

---

## Executive summary

### Current state assessment: 6.5/10

**Working today:**
- TypeScript strict mode
- Supabase with RLS
- Next.js 14
- Basic auth & authorization
- Component structure
- Vitest configured

**Critical gaps:**
- 74 dashboard pages (2–3× target)
- 94 API routes (many duplicate/inefficient)
- No billing (Stripe)
- No email (Resend/SendGrid)
- No structured monitoring (logs, errors, performance)
- No feature flags
- Middleware: 3–4 DB calls per request
- Missing many “elite” features from role definitions
- No error boundaries
- No caching strategy

### Roadmap overview

| Category       | Count | Effort  | Priority |
|----------------|-------|---------|----------|
| Architecture   | 23    | 4 weeks | P0       |
| Security       | 47    | 2 weeks | P0       |
| Performance    | 89    | 3 weeks | P0–P1    |
| Missing features | 156 | 6 weeks | P1–P2    |
| Code quality   | 234   | 4 weeks | P1–P2    |
| Database       | 45    | 2 weeks | P0–P1    |
| API design     | 78    | 3 weeks | P1       |
| UI/UX          | 112   | 4 weeks | P1–P2    |
| DevOps         | 34    | 1 week  | P1       |
| Monitoring     | 29    | 1 week  | P0       |

**Total:** ~847 changes, 12–16 weeks (3–4 months).

---

## Section 1: Architecture upgrades

### 1.1 Project structure (P0)

**Current issues:**
- Flat component structure
- Business logic mixed with UI
- No clear separation of concerns
- Inconsistent naming

**Target structure:**
```
src/
  components/
    features/          # Feature-specific
      candidate/ dashboard | profile | jobs
      recruiter/
      company/
      admin/
    shared/            # Reusable
      ui/ | forms/ | charts/ | tables/
    layout/            # Header, Sidebar, DashboardLayout
  services/
    api/               # candidateService, jobService, matchingService, billingService, emailService
    external/          # stripe, resend, supabase wrapper
  repositories/        # Base + candidate, job, match, application
  lib/
    di/                # Optional: container for DI
```

**Changes:** #1 Reorganize components, #2 Service layer, #3 Repository pattern, #4 Optional DI.  
**Effort:** ~2 weeks.

### 1.2 Middleware optimization (P0)

**Current:** 3–4 DB calls per request (profile_roles, candidates twice) → ~300–600 ms added latency.

**Changes:**
- **#5 Middleware caching:** Use Upstash Redis to cache profile by `user.id` (e.g. 5 min TTL). Single DB read on cache miss; cache hit avoids DB. Target: ~400 ms → ~50 ms.
- **#6 Request ID & tracing:** Add `x-request-id`, `x-request-start`, `x-response-time` and structured log per request.

**Effort:** ~1–2 days. **Files:** `src/middleware.ts`.

### 1.3 Configuration (P0)

**Current:** Env vars scattered, no validation, no type safety.

**Change #7:** Centralized config with Zod:
- `src/config/index.ts`: schema for all env (Supabase, Stripe, Resend, Redis, Sentry, PostHog, feature flags, rate limits).
- Parse on startup; fail fast with clear errors.
- **Dependency:** `zod`. **Effort:** ~4 hours.

---

## Section 2: Security upgrades

### 2.1 Auth & authorization (P0)

- **#8 Rate limiting (auth):** Upstash Ratelimit on login/signup (e.g. 5/15 min per IP). Apply to all auth routes.
- **#9 Session management:** Redis-backed sessions (create, get, revoke, revoke-all, list active). Optional if Supabase Auth is sole source of truth.
- **#10 IP blocking:** Track failed attempts per IP; block after N failures (e.g. 10) for 1 hour. Use in auth routes.

**Effort:** ~2 days. **Dependencies:** Upstash Redis (already assumed for middleware cache).

### 2.2 Data validation (P0)

- **#11 Input validation:** Zod schemas for all API inputs (candidates, jobs, applications, messages, pagination). Use in every route; return 400 + details on validation error.
- **#12 XSS protection:** Sanitize HTML for rich text (e.g. DOMPurify / isomorphic-dompurify); sanitize text/JSON where needed. Use when rendering user content.

**Effort:** ~3 days. **Files:** All API routes (~94).

### 2.3 API security (P0)

- **#13 API keys:** Generate/validate/revoke API keys per company (e.g. Redis: `api_key:*`, `company:*:api_keys`). Use for external/public API routes (e.g. `x-api-key` header).

**Effort:** ~1 day.

---

## Section 3: Performance upgrades

### 3.1 Database (P0)

- **#14 Indexes:** Migration for high-impact indexes:
  - Profiles / profile_roles: `id`, `company_id`, `effective_role`
  - Candidates: `user_id`, `email`, `onboarding_completed`, composite (company_id, status)
  - Jobs: `company_id`, `posted_by`, `is_active`, `posted_at`, composite (company_id, is_active, posted_at)
  - Applications: `candidate_id`, `job_id`, `status`, `created_at`, composites (candidate_id, status, created_at), (job_id, status, created_at)
  - candidate_job_matches: `candidate_id`, `job_id`, `fit_score`, `matched_at`, composite (candidate_id, fit_score, matched_at) WHERE fit_score >= 70
  - Messages, conversation_participants: conversation_id + created_at, profile_id
- **#15 N+1 fixes:** Replace “load list then load related per item” with single queries using Supabase `.select('*, relation(*)')`. Audit and fix ~20–30 call sites.
- **#16 Query caching:** Redis cache layer for hot reads (e.g. jobs by company, match counts). Invalidate on write. Use in high-traffic API routes.

**Effort:** ~1 week. **Files:** New migration + API routes and services.

### 3.2 Frontend (P1)

- **#17 React Query:** TanStack Query for all server state: jobs, candidates, matches, applications. Centralized defaults (staleTime, retry). Hooks per resource; invalidate on mutations.
- **#18 Code splitting:** Dynamic imports for heavy dashboard components (e.g. MatchesList, ApplicationsList, reports). Suspense + skeletons.
- **#19 Images:** Use Next.js `Image` with AVIF/WebP, sizes, and priority for above-the-fold assets.

**Effort:** ~5 days.

---

## Section 4: Missing enterprise features

### 4.1 Billing & subscriptions (P0)

**Current:** No billing, no Stripe, no subscriptions.

- **#20 Stripe billing:**
  - Service: create customer, create/update/cancel subscription, handle webhooks (subscription created/updated/deleted, invoice.paid).
  - DB: subscription_plans, company_subscriptions, payment_methods, invoices, usage_events (if metered).
  - API: checkout (create customer + subscription, return client_secret), webhook route, portal/upgrade as needed.
- **#21 Feature gates:** `checkFeatureAccess(companyId, feature)` using subscription plan limits; `trackUsage(companyId, eventType)`. Enforce in job post, application, AI usage, etc. Return 403 + upgrade_url when over limit.

**Effort:** ~1–2 weeks. **Dependencies:** `stripe`, `@stripe/stripe-js`.

**Note:** Project already has `pricing_plans`, `candidate_subscriptions`, `company_usage`, Stripe-related columns on profiles/companies. Align new schema with existing tables and migrate incrementally.

### 4.2 Email (P0)

**Current:** No transactional email.

- **#22 Resend integration:**
  - Service wrapper: `sendEmail({ to, subject, html, ... })`.
  - Templates: welcome, application received, interview scheduled, etc. (HTML + config.NEXT_PUBLIC_APP_URL).
  - Send on: signup (welcome), application submit (confirmation), interview scheduled, status changes (optional).
  - Table: email_logs (user_id, email_type, sent_to, sent_at, opened_at, clicked_at, bounced) for tracking and debugging.

**Effort:** ~3 days. **Dependencies:** `resend`.

---

## Section 5: Implementation priority

### Phase 1 — Foundation (weeks 1–2)

1. **Config & validation (#7, #11)** — Central config + Zod; add validation to critical API routes (auth, candidates, jobs, applications).
2. **Middleware (#5, #6)** — Profile cache + request ID/tracing.
3. **Security (#8, #10)** — Auth rate limit + IP blocking on login/signup.
4. **DB indexes (#14)** — One migration with the indexes above; no app code change.

### Phase 2 — Reliability & performance (weeks 3–4)

5. **N+1 and caching (#15, #16)** — Fix N+1 in top 10 routes; add Redis caching for jobs/matches where appropriate.
6. **Error handling** — Error boundaries for dashboard; consistent API error shape (code, message, details).
7. **Monitoring** — Structured logging (request id, user, duration); optional Sentry/PostHog.

### Phase 3 — Revenue & engagement (weeks 5–8)

8. **Billing (#20, #21)** — Wire Stripe to existing company/profile subscription fields; checkout + webhooks; feature gates on job post and key actions.
9. **Email (#22)** — Resend + templates; trigger on signup and application submitted.
10. **Feature flags** — Simple (env or DB) flags for billing, email, AI features; use in config and API.

### Phase 4 — Scale & polish (weeks 9–12+)

11. **Service/repository layer (#2, #3)** — Extract services and repositories incrementally per domain.
12. **React Query (#17)** — Migrate data fetching to hooks + invalidation.
13. **Component restructure (#1)** — Move to features/shared/layout in small steps.
14. **API keys (#13)** — For external integrations and future public API.

---

## Reference: existing codebase alignment

- **Billing:** `pricing_plans`, `candidate_subscriptions`, `company_usage`, Stripe fields on `profiles`/`companies` — extend rather than replace.
- **Auth:** Supabase Auth + RLS; middleware uses `profile_roles`. Caching and rate limiting complement this.
- **DB:** Supabase migrations in `supabase/migrations/`; add new migration for indexes and any new billing/email tables.
- **Config:** Use existing `.env` and Next.js env handling; add Zod validation in a single `src/config` module.

---

## Document history

- **2026-03-08:** Initial enterprise upgrade plan created from line-by-line analysis. Sections 1–4 summarized; implementation priority and phase plan added. Full detail for each change (code snippets, file lists) can be added in follow-up docs or tickets.
