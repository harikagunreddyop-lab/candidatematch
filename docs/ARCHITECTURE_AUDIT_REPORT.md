# CandidateMatch B2B SaaS — Architecture Audit Report

**Date:** 2025-03-07  
**Auditor:** Cursor AI  
**Scope:** Full platform analysis (dashboards, workflows, DB, UI, ingestion)

---

## EXECUTIVE SUMMARY

### System Status: NEEDS MAJOR REBUILD 🔴

The platform is built around a **staffing-agency model** (admin assigns candidates to recruiters) while the stated product is **B2B multi-tenant SaaS**. The recruiter experience, platform-admin focus, and several workflows do not match B2B SaaS requirements.

### Critical Issues: 4

1. **Recruiter dashboard uses recruiter_candidate_assignments** — Recruiters see “assigned” candidates; they should see candidates matched to **their company’s jobs** (jobs.created_by / company_id).
2. **Platform admin dashboard leads with candidates/jobs/assignments** — Should lead with **companies**, MRR/ARR, system health, connector status.
3. **Recruiter “Jobs” page shows all jobs** — JobSearchView has no company_id/created_by filter; recruiters see global job board, not “my company’s jobs” or “jobs I posted.”
4. **Assignments page and staffing flow are first-class** — Admin “Assign recruiters” and recruiter “My candidates” are core flows; they should be removed or demoted in favor of job-based matching.

### Severity Breakdown

- 🔴 **CRITICAL (rebuild required):** 4  
- 🟡 **MAJOR (refactor required):** 5  
- 🟢 **MINOR (fixes only):** 4  
- ⚪ **ENHANCEMENT:** 3  

### Estimated Rebuild: 2–3 weeks

- **Week 1:** Platform admin dashboard + recruiter model (remove assignments, job-based pipeline).
- **Week 2:** Company admin completeness + recruiter jobs/pipeline alignment + candidate refinements.
- **Week 3:** Job ingestion hardening, UI/UX polish, design system.

---

## TASK 1: Platform Admin Dashboard Audit

**File:** `src/app/dashboard/admin/page.tsx`

### Current Implementation

- **Primary focus:** Candidates, Jobs, Applications, Resumes, Recruiters, **Assignments** (staffing metrics).
- **Metrics shown:**  
  - Candidates (count), Jobs (count), Applications (count), Resumes generated (count), Recruiters (count), **Assignments** (count from `recruiter_candidate_assignments`).  
  - Recent applications, latest jobs, new candidates.  
  - Quick actions: Invite user, **Assign recruiters**, Pipeline, Reports.
- **Database queries:**
  - `profiles` (role = candidate) → candidate user IDs.
  - `candidates` (count, filtered by those user_ids).
  - `jobs` (count, no company filter).
  - `resume_versions` (generation_status = completed).
  - `applications` (count; no company_id filter — correct for platform admin).
  - `profiles` (role = recruiter) count.
  - **`recruiter_candidate_assignments`** (count).
  - Recent: applications (with job, candidate), jobs (all), candidates (all).
- **Model type:** Staffing Agency ❌ / B2B SaaS ✅ → **Staffing Agency ❌**

### Critical Issues

1. ❌ **Companies not primary** — Dashboard does not lead with companies; companies exist only as a separate nav item.
2. ❌ **No MRR/ARR or revenue metrics** — No subscription/revenue view.
3. ❌ **No system health** — No DB/cache/connector status on dashboard (health exists at `/api/health` but not surfaced).
4. ❌ **Assignments and “Assign recruiters”** — Core flow is staffing (assign candidates to recruiters).
5. ❌ **Jobs/candidates without company context** — Recent jobs and candidates are global, not per-company.
6. ⚠️ **Recruiters count is global** — Not “recruiters per company” or “companies with recruiters.”

### Security

- Platform admin can see all data (no hardcoded company_id on admin dashboard). ✅  
- Applications query is intentionally global for platform admin. ✅  
- No identified data leakage from admin dashboard.

### Missing for B2B SaaS

1. ⬜ Companies as primary entity (table/list/cards on dashboard).
2. ⬜ MRR/ARR revenue metrics.
3. ⬜ System health panel (DB, cache, connectors).
4. ⬜ Connector / ingestion status (last run, jobs added, errors).
5. ⬜ Per-company breakdown (e.g. jobs/applications per company).
6. ⬜ Subscription states: active, trialing, past_due.

### Recommended Action

**COMPLETE REBUILD** ❌  

### Priority

**CRITICAL** 🔴  

---

## TASK 2: Company Admin Dashboard Audit

**File:** `src/app/dashboard/company/page.tsx`

### Current Implementation

- **Company ID source:** `profile_roles` (session → profile_roles where id = session.user.id → company_id). ✅  
- **Data isolation:** All queries use `profile.company_id`: companies, company_analytics, profiles (team), jobs, candidate_activity. ✅  
- **Sections:** Company header (logo, name, plan, status), KPIs (jobs posted, applications, interviews, hires), hiring funnel, team list, active jobs, activity feed, plan upgrade CTA.

### Security

- ✅ company_id from profile_roles.  
- ✅ Job queries filtered by company_id.  
- ✅ Team and activity filtered by company_id.  
- ⚠️ Candidate contact / success-fee gating not audited on this page (lives in candidate contact flows).  
- ✅ No JOIN that leaks other companies.

### Feature Completeness

- ✅ Company jobs.  
- ✅ Team (recruiters + company_admin).  
- ✅ Company analytics (company_analytics view).  
- ✅ Billing link (settings/billing).  
- ⚠️ Billing UI may be incomplete (Stripe portal link only).  
- ❌ Success fee agreement flow not prominent.  
- ❌ No recruiter performance comparison on this page.

### Recommended Action

**MAJOR REFACTOR** ⚠️ — Add success fee flow, recruiter performance, ensure billing is complete.

### Priority

**HIGH** 🟡  

---

## TASK 3: Recruiter Dashboard Audit (CRITICAL)

**File:** `src/app/dashboard/recruiter/page.tsx`

### Primary Query (data model)

```typescript
const { data: assignments } = await supabase
  .from('recruiter_candidate_assignments')
  .select('candidate_id')
  .eq('recruiter_id', rid);

const allIds = (assignments || []).map((a: any) => a.candidate_id);
// Then: candidates in allIds, candidate_job_matches in allIds, applications in allIds
```

### Model Detection

- **Uses recruiter_candidate_assignments:** YES ❌  
- **Uses jobs.created_by (or company jobs) for recruiter scope:** NO ❌  
- **Current model:** STAFFING AGENCY ❌  
- **Target model:** B2B SaaS ✅  

### Staffing Agency Model Detected

**CRITICAL:** Recruiter experience is built for staffing, not B2B SaaS.

**Current flow:**

1. Platform/company admin assigns candidates to recruiter via Admin → Assignments.  
2. Recruiter sees “My candidates” = assigned candidates.  
3. New matches and pipeline are derived from those assigned candidate IDs.  
4. Empty state: “No candidates assigned yet” / “Ask your admin to assign candidates to you.”

**Should be (B2B SaaS):**

1. Recruiter (or company) posts job (jobs.company_id, jobs.posted_by/created_by).  
2. Matching produces candidate_job_matches for that job.  
3. Recruiter sees candidates matched to **their company’s jobs** (or jobs they created).  
4. Pipeline = applications to those jobs.

**Impact:** Recruiters cannot manage “their posted jobs” or “candidates for our jobs”; they only see an assigned pool. Recruiter “Jobs” page (`JobSearchView`) shows **all active jobs** with no company_id/created_by filter — so it’s a global board, not “my company’s jobs.”

### Files Affected

- `src/app/dashboard/recruiter/page.tsx` — assignments-based load.  
- `src/app/dashboard/recruiter/candidates/page.tsx` — lists candidates from recruiter_candidate_assignments.  
- `src/app/dashboard/recruiter/candidates/[id]/page.tsx` — candidate detail (likely same model).  
- `src/app/dashboard/recruiter/applications/page.tsx` — applications for assigned candidates.  
- `src/app/dashboard/recruiter/pipeline/page.tsx` — pipeline for assigned candidates.  
- `src/app/dashboard/recruiter/jobs/page.tsx` — uses JobSearchView with no company filter (shows all jobs).  
- `src/app/dashboard/recruiter/reports/page.tsx` — may depend on assignments.  
- `src/app/dashboard/recruiter/messages/page.tsx` — may depend on assignments.  

### Database / API

- **Remove dependency on recruiter_candidate_assignments** for recruiter scope.  
- **Recruiter scope:** jobs where company_id = recruiter’s company AND (optional) created_by = recruiter id.  
- **Candidates:** from candidate_job_matches + applications for those jobs.  
- **Pipeline:** applications to company jobs (and optionally “my” jobs).

### Rebuild Scope

**COMPLETE REWRITE** of recruiter dashboard, candidates list, pipeline, and recruiter jobs view.  

### Priority

**CRITICAL** 🔴  

### Estimated Time

~2 days (recruiter flows + job-based data).

---

## TASK 4: Candidate Dashboard Audit

**File:** `src/app/dashboard/candidate/page.tsx`  
**Data:** Matches via `GET /api/candidate/matches` (candidate_job_matches by candidate_id). Applications, saved jobs, reminders, resumes from Supabase with candidate_id/user_id isolation.

### Current Implementation

- **Shows matches:** YES ✅ (API uses candidate_job_matches, scoped by candidate_id).  
- **Shows applications:** YES ✅.  
- **Shows resumes:** YES ✅.  
- **Data isolation:** Correct ✅ (candidate by user_id; matches/applications by candidate_id).  
- **No leakage:** Only own candidate and related matches/applications. ✅  

### UX

- **Navigation:** Tabs (overview, matches, applications, resumes, saved, reminders) — CLEAR ✅.  
- **Workflows:** Apply, save job, reminders, profile, ATS — INTUITIVE ✅.  
- **Guidance:** Recommended step, profile completeness, match limits — HELPFUL ✅.  

### Issues

- Copy still references “Your recruiter is curating…” (staffing framing) in at least one empty state.  
- Minor: Some empty states could be more B2B/self-serve.

### Recommended Action

**KEEP / REFINE** — Align copy with B2B (remove staffing language).  

### Priority

**MEDIUM** 🟢  

---

## TASK 5: All Dashboard Pages — Summary

| Page | Role | Purpose | B2B SaaS? | Action | Priority |
|------|------|---------|-----------|--------|----------|
| `dashboard/page.tsx` | All | Role redirect | N/A | KEEP | — |
| `dashboard/admin/page.tsx` | Platform Admin | Main dashboard | NO ❌ | REBUILD | 🔴 |
| `dashboard/admin/candidates/page.tsx` | Platform Admin | All candidates | PARTIAL ⚠️ | REFACTOR (add company context) | 🟡 |
| `dashboard/admin/candidates/[id]/page.tsx` | Platform Admin | Candidate detail | PARTIAL ⚠️ | REFACTOR | 🟡 |
| `dashboard/admin/jobs/page.tsx` | Platform Admin | All jobs | PARTIAL ⚠️ | REFACTOR (per-company) | 🟡 |
| `dashboard/admin/applications/page.tsx` | Platform Admin | All applications | PARTIAL ⚠️ | REFACTOR (company filter) | 🟡 |
| `dashboard/admin/companies/page.tsx` | Platform Admin | Companies list | YES ✅ | KEEP + enhance | 🟢 |
| `dashboard/admin/companies/[id]/page.tsx` | Platform Admin | Company detail | YES ✅ | KEEP | 🟢 |
| `dashboard/admin/companies/new/page.tsx` | Platform Admin | New company | YES ✅ | KEEP | 🟢 |
| `dashboard/admin/assignments/page.tsx` | Platform Admin | Assign recruiters to candidates | NO ❌ | DELETE or demote | 🔴 |
| `dashboard/admin/users/page.tsx` | Platform Admin | Users (recruiters, etc.) | PARTIAL ⚠️ | REFACTOR (company context) | 🟡 |
| `dashboard/admin/pipeline/page.tsx` | Platform Admin | Pipeline (assignments-based) | NO ❌ | REBUILD (job/company-based) | 🔴 |
| `dashboard/admin/reports/page.tsx` | Platform Admin | Reports | PARTIAL ⚠️ | REFACTOR | 🟡 |
| `dashboard/admin/interviews/page.tsx` | Platform Admin | Interviews | PARTIAL ⚠️ | REFACTOR | 🟢 |
| `dashboard/admin/messages/page.tsx` | Platform Admin | Messages | PARTIAL ⚠️ | REFACTOR | 🟢 |
| `dashboard/admin/settings/page.tsx` | Platform Admin | Settings | YES ✅ | KEEP | 🟢 |
| `dashboard/admin/compliance/page.tsx` | Platform Admin | Compliance | YES ✅ | KEEP | 🟢 |
| `dashboard/admin/audit/page.tsx` | Platform Admin | Audit | YES ✅ | KEEP | 🟢 |
| `dashboard/admin/job-boards/page.tsx` | Platform Admin | Job boards | YES ✅ | KEEP | 🟢 |
| `dashboard/company/page.tsx` | Company Admin | Company dashboard | YES ✅ | REFINE | 🟡 |
| `dashboard/company/jobs/page.tsx` | Company Admin | Company jobs | YES ✅ | KEEP | 🟢 |
| `dashboard/company/team/page.tsx` | Company Admin | Team | YES ✅ | KEEP | 🟢 |
| `dashboard/company/team/invite/page.tsx` | Company Admin | Invite recruiter | YES ✅ | KEEP | 🟢 |
| `dashboard/company/activity/page.tsx` | Company Admin | Activity | YES ✅ | KEEP | 🟢 |
| `dashboard/company/analytics/page.tsx` | Company Admin | Analytics | YES ✅ | KEEP | 🟢 |
| `dashboard/company/settings/page.tsx` | Company Admin | Settings | YES ✅ | KEEP | 🟢 |
| `dashboard/company/settings/billing/page.tsx` | Company Admin | Billing | YES ✅ | REFINE | 🟡 |
| `dashboard/company/messages/page.tsx` | Company Admin | Messages | YES ✅ | KEEP | 🟢 |
| `dashboard/recruiter/page.tsx` | Recruiter | Recruiter dashboard | NO ❌ | REBUILD | 🔴 |
| `dashboard/recruiter/candidates/page.tsx` | Recruiter | My candidates | NO ❌ | REBUILD | 🔴 |
| `dashboard/recruiter/candidates/[id]/page.tsx` | Recruiter | Candidate detail | NO ❌ | REBUILD | 🔴 |
| `dashboard/recruiter/jobs/page.tsx` | Recruiter | Jobs (JobSearchView) | NO ❌ | REBUILD (company/my jobs) | 🔴 |
| `dashboard/recruiter/applications/page.tsx` | Recruiter | Applications | NO ❌ | REBUILD | 🔴 |
| `dashboard/recruiter/pipeline/page.tsx` | Recruiter | Pipeline | NO ❌ | REBUILD | 🔴 |
| `dashboard/recruiter/reports/page.tsx` | Recruiter | Reports | PARTIAL ⚠️ | REFACTOR | 🟡 |
| `dashboard/recruiter/messages/page.tsx` | Recruiter | Messages | PARTIAL ⚠️ | REFACTOR | 🟡 |
| `dashboard/recruiter/integrations/page.tsx` | Recruiter | Integrations | YES ✅ | KEEP | 🟢 |
| `dashboard/candidate/page.tsx` | Candidate | Candidate dashboard | YES ✅ | REFINE | 🟢 |
| `dashboard/candidate/jobs/page.tsx` | Candidate | Job search (candidate) | YES ✅ | KEEP | 🟢 |
| `dashboard/candidate/profile/page.tsx` | Candidate | Profile | YES ✅ | KEEP | 🟢 |
| Other candidate pages | Candidate | Applications, resumes, etc. | YES ✅ | KEEP | 🟢 |

---

## TASK 6: Workflow Gap Analysis (Condensed)

### Platform Admin

| Workflow | Current path | Status | Priority |
|----------|--------------|--------|----------|
| View all paying companies | Dashboard → Companies (separate) | ⚠️ Exists but not on dashboard | 🔴 |
| Check job ingestion status | No dashboard widget | ❌ Missing | 🔴 |
| See which company has most applications | Companies list has no sort by applications | ❌ Missing | 🟡 |
| Suspend company for non-payment | Company detail → billing/suspend | ⚠️ Unclear if full flow exists | 🟡 |
| Debug matching issues | No System → Matching → Logs | ❌ Missing | 🟡 |
| View MRR/ARR | Not present | ❌ Missing | 🔴 |
| Assign recruiters to candidates | Admin → Assignments | ✅ Exists (wrong model) | 🔴 |
| View pipeline (all applications) | Admin → Pipeline | ✅ Exists (assignments-based) | 🔴 |

### Company Admin

| Workflow | Status | Priority |
|----------|--------|----------|
| Post a new job | ✅ Company → Post Job | 🟢 |
| Invite recruiter | ✅ Team → Invite | 🟢 |
| See candidates for our jobs | ⚠️ Via recruiter/assignments, not job-centric | 🔴 |
| Upgrade subscription | ✅ Billing link | 🟡 |
| Review success fees owed | ⚠️ Schema exists; UI unclear | 🟡 |
| Compare recruiter performance | ❌ Missing | 🟡 |
| Sign success fee agreement | ⚠️ Needs verification | 🟡 |

### Recruiter

| Workflow | Current path | Status | Priority |
|----------|--------------|--------|----------|
| Post a job | Company flow; recruiter sees “Browse jobs” (all jobs) | ⚠️ Confusing | 🔴 |
| See candidates matched to MY job | No; sees “assigned” candidates | ❌ Wrong model | 🔴 |
| Move candidate to interview stage | Applications for assigned candidates | ⚠️ Exists but wrong pool | 🔴 |
| Message a candidate | Messages (assignment-based) | ⚠️ Refactor | 🔴 |
| Mark candidate as hired | Applications | ⚠️ Refactor | 🟡 |
| Edit my job posting | Recruiter jobs = global list | ❌ Missing “my jobs” | 🔴 |
| Close a job | Not recruiter-scoped | ❌ Missing | 🔴 |

### Candidate

| Workflow | Status | Priority |
|----------|--------|----------|
| See jobs I'm a good fit for | ✅ Matches (candidate_job_matches) | 🟢 |
| Apply to job | ✅ | 🟢 |
| Check application status | ✅ | 🟢 |
| Upload resume | ✅ | 🟢 |
| Improve ATS score | ✅ | 🟢 |
| Save jobs | ✅ | 🟢 |

---

## TASK 7: Database Schema Alignment

### recruiter_candidate_assignments

- **Exists:** Yes (e.g. `001_initial.sql`, `002_recruiter_assignments_rls.sql`).  
- **Purpose:** Staffing agency model (assign candidates to recruiters).  
- **Used by:** Admin assignments page, recruiter dashboard, recruiter candidates, pipeline, applications (recruiter filter), messages, compliance, reports, etc.  
- **B2B SaaS needs this table for recruiter scope:** NO ❌.  
- **Action:** Stop using for recruiter scope; migrate to job-based (jobs.created_by / company_id). Optionally deprecate/remove table after migration.

### jobs table

- **company_id:** Present (e.g. 039, 041); NOT NULL in RLS/usage. ✅  
- **created_by / posted_by:** created_by added (041); posted_by used on insert. ✅  
- **Conclusion:** Every job should have company_id and creator; recruiter views should filter by company_id and optionally created_by.

### RLS (039_multitenant_rbac.sql)

- **Companies:** get_user_company(), is_company_admin_or_above() used for company-scoped tables.  
- **Jobs:** SELECT/UPDATE/INSERT/DELETE require company_id = get_user_company().  
- **Can company A see company B's jobs?** No (RLS enforces company_id). ✅  
- **Can company A see company B's candidates?** Candidates are not company-owned; access is via applications/jobs and assignments. For B2B, candidate access should be through jobs (candidate_job_matches, applications) scoped by company.  
- **Can recruiter see other recruiters' jobs?** Currently recruiter “jobs” view is global (no RLS filter in JobSearchView). Should be restricted to company (and optionally own jobs).  
- **Can candidate see other candidates?** No; candidate data is by user_id/candidate_id. ✅  

---

## TASK 8: UI/UX Quality Assessment

### Components (`src/components/ui/`)

- **Files:** index.tsx (Modal, Toast, Spinner, EmptyState, StatCard, StatusBadge, FitScore, Tabs, ConfirmDialog, Skeletons, SearchInput), ChatComponents.tsx, AdminNotifications.tsx, FloatingChatWidget.tsx.  
- **Quality:** Custom Tailwind-based; consistent tokens (e.g. surface-*, brand-*). Reusable primitives.  
- **Assessment:** GOOD ⚠️ — Not a full design system; no documented spacing/color scale.

### Dashboard UI

- **Color system:** Role accent, surface, brand — Consistent ✅.  
- **Typography:** font-display, hierarchy — Clear ✅.  
- **Spacing:** Systematic in cards/panels ✅.  
- **Loading/empty/error:** Spinner, EmptyState, error toasts used ✅.  
- **Overall:** PRODUCT-GRADE ✅ / GOOD ⚠️ — Feels consistent; not “template-like.”

### Recommendation

- **Design system:** Document tokens and patterns (MEDIUM).  
- **Component library:** REFINE ⚠️ (add company/job context to lists, fix recruiter views).  
- **Polish:** MINOR ⚠️ (copy, empty states, success fee/billing flows).

---

## TASK 9: Job Ingestion System Audit

**Files:** `src/ingest/sync-v2.ts`, `src/ingest/adapters/*`, `src/app/api/cron/ingest/route.ts`

### Current Capabilities

- **Connectors:** Adapters: adzuna, lever, ashby, greenhouse (from adapters index).  
- **Parallelism:** ITEM_CONCURRENCY (default 50), CONNECTOR_CONCURRENCY (default 10), batch upserts (INGEST_UPSERT_BATCH_SIZE, default 1000).  
- **Deduplication:** content_hash used to skip unchanged ingest_jobs.  
- **Validation:** Adapter-level normalize/detail; no explicit quality scoring or spam detection in audit.  
- **Cron:** GET /api/cron/ingest (CRON_SECRET); writes cron_run_history; returns fetched/upserted/promoted/skipped.

### Requirements for 10k+ jobs/day

- Parallel processing ✅  
- Batch operations ✅  
- Content hash caching ✅  
- Quality filters ⚠️ (not clearly present)  
- Spam/invalid/duplicate detection ⚠️ (partial via content_hash)  
- Performance tuning ✅ (configurable concurrency/batch)

### Recommendation

- Add quality scoring and spam/invalid filters for scale.  
- Document last run and errors on platform admin dashboard.

---

## REBUILD SEQUENCE

### Phase 1: Critical (Week 1)

**Days 1–2: Platform Admin**

- Dashboard: Companies as primary; MRR/ARR (or placeholders); system health (DB, cache, connectors); last ingest run.  
- Companies list/detail already exist; add to dashboard and per-company metrics.  
- Remove or demote “Assignments” and “Assign recruiters” from primary nav/quick actions.  
- Pipeline/reports: add company filter; prepare for job-based pipeline.

**Days 3–5: Recruiter model**

- Remove recruiter_candidate_assignments from recruiter scope.  
- Recruiter data: jobs where company_id = user’s company (and optionally created_by = user id).  
- Candidates: from candidate_job_matches + applications for those jobs.  
- Rebuild: recruiter dashboard, candidates list, pipeline, applications.  
- Recruiter “Jobs” page: show company jobs (and “my posted jobs” if created_by is used); remove global JobSearchView for recruiter.

### Phase 2: Enhance (Week 2)

**Days 6–7: Company Admin**

- Success fee agreement flow (sign, review).  
- Billing UI completeness.  
- Recruiter performance comparison (by company).

**Days 8–10: Candidate**

- Copy and empty states: remove “recruiter curating” staffing language.  
- Minor UX refinements.

### Phase 3: Scale & Polish (Week 3)

**Days 11–13: Job ingestion**

- Quality scoring; spam/invalid detection.  
- Dashboard widget for last run and errors.

**Days 14–15: UI/UX**

- Design system doc (tokens, components).  
- Empty states and copy pass.

---

## PRIORITY MATRIX

| Component | Current | Target | Priority | Effort |
|-----------|---------|--------|----------|--------|
| Platform Admin Dashboard | Staffing / global | B2B (companies, MRR, health) | 🔴 | 1–2 d |
| Recruiter experience | Assignments | Jobs → matches → pipeline | 🔴 | 2 d |
| Recruiter Jobs page | Global job board | Company / my jobs | 🔴 | 0.5 d |
| Admin Assignments / Pipeline | Core staffing | Remove or demote | 🔴 | 1 d |
| Company Admin | Good | Success fee, billing, perf | 🟡 | 1 d |
| Candidate | Good | Copy + small refinements | 🟢 | 0.5 d |
| Job ingestion | Good | 10k+/day, quality filters | 🟡 | 2–3 d |
| UI/UX | Good | Design system, polish | 🟡 | 2 d |

---

## SUCCESS CRITERIA (Post-Rebuild)

- ✅ B2B SaaS architecture: companies first; recruiters see job-based pipeline.  
- ✅ Role-based dashboards aligned with B2B (no staffing-assignment as primary).  
- ✅ Recruiter: “My company’s jobs” and “Candidates for our jobs” (from matches + applications).  
- ✅ Platform admin: companies, revenue (or placeholders), system health, connector/ingest status.  
- ✅ Data isolation: company_id and RLS enforced; no cross-tenant leakage.  
- ✅ Job ingestion ready for 10k+/day with quality/spam controls.  
- ✅ Candidate experience unchanged in behavior; copy aligned with B2B.

---

## NEXT STEPS

1. ✅ Review this audit.  
2. ⬜ Approve rebuild plan and priorities.  
3. ⬜ Execute Phase 1 (platform admin + recruiter model).  
4. ⬜ Execute Phase 2–3 (company admin, candidate, ingestion, UI).  
5. ⬜ QA (roles, isolation, workflows).  
6. ⬜ Production deployment.

---

*End of Audit Report*
