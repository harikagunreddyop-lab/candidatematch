# CandidateMatch — Feature Roadmap

**Goal:** From a strong matching + ATS platform to the **best-in-class recruitment conversion system** in the market.

---

## Recently implemented (this release)

- **Rate limits in UI** — Candidate dashboard shows “X of 40 applications today”; recruiter/admin usage via `GET /api/applications/usage`.
- **Application confirmation** — In-app success toast “Applied to {title} at {company}” after apply; POST applications returns `job: { title, company }`.
- **Application status timeline** — `application_status_history` table; PATCH application records status change with actor; `GET /api/applications/timeline?application_id=` for timeline.
- **Cron run visibility** — `cron_run_history` table; cron job writes start/end and status; admin dashboard shows “Last cron run” with time, status, counts; `GET /api/cron/history`.
- **“Not interested” / hide job** — `candidate_hidden_jobs` table; `POST/DELETE /api/hide-job`; matching excludes hidden jobs per candidate.
- **Job freshness** — `jobs.last_seen_at` and `jobs.ats_provider` columns (migration 014).
- **Feature flags** — `feature_flags` table (key, value, role); `GET /api/feature-flags` returns flags for current user role.
- **Bulk assign** — Already present; assignments page supports multi-select candidates and one recruiter.

---

## Tier 1 — Must add (immediate / critical)

*Fix gaps that block trust, scale, or daily use.*

| # | Feature | Why critical |
|---|--------|---------------|
| 1 | **Email deliverability & templates** | Invites and magic links must land in inbox; add SPF/DKIM, verified domain, and editable email templates (invite, password reset, application confirmation). |
| 2 | **Structured onboarding for candidates** | After accept-invite: guided steps (upload resume → parse → confirm profile → view first matches). Reduces drop-off and bad data. |
| 3 | **Job source & freshness** | Every job: `source` (scrape / upload / ATS sync), `last_seen_at`, and “stale” flag (e.g. 30 days). Hide or down-rank stale jobs in matching. |
| 4 | **Application confirmation & receipts** | When candidate applies: in-app toast + optional email receipt with job title, company, date. Audit trail for “did I apply?” |
| 5 | **Rate limits & quotas in UI** | Show candidate “X of 40 applications today” and recruiter limits. Clear errors when limit hit instead of generic failure. |
| 6 | **Matching visibility for candidate** | “Why this score?” summary (e.g. 3 bullets from Elite ATS) on match card; link to “Improve this match” (resume fix report) where it exists. |
| 7 | **Recruiter assignment UX** | Bulk assign (select many candidates → one recruiter), “Assign to me” for recruiter, and unassign with reason for audit. |
| 8 | **Cron & job run visibility** | Admin: last cron run time, status (ok/failed), link to logs or simple run history (e.g. last 10 runs with counts). |

---

## Tier 2 — Important (optimization & functionality)

*High impact for efficiency, accuracy, and retention.*

| # | Feature | Why important |
|---|--------|----------------|
| 9 | **Smart job de-duplication** | On scrape/upload: fuzzy match (title + company) → merge or flag duplicate. Keeps job list clean and matching accurate. |
| 10 | **Candidate “not interested” / hide job** | Let candidate hide or mark “not interested” on a match; exclude from future matching and from their list. |
| 11 | **Saved searches for recruiters** | Recruiter saves filters (e.g. “Score ≥80, location NYC, no application yet”); one-click run and optional email digest. |
| 12 | **Bulk actions (admin/recruiter)** | Select multiple candidates or applications → bulk status update, bulk assign, bulk export, bulk “run matching for selected”. |
| 13 | **Interview calendar sync** | Store interview date/time; optional sync to Google/Outlook or send .ics. Reminders (existing reminders) tied to calendar. |
| 14 | **Resume version comparison** | Side-by-side or diff view: “Generated v1 vs v2” or “Original vs tailored for Job X”. |
| 15 | **Application notes timeline** | One timeline per application: status changes, recruiter notes, interview notes, with actor and timestamp. |
| 16 | **Match decay / re-run policy** | Configurable rule: “Re-run matching for candidate if no run in 7 days” or “If job list grew by 20%”. Improves freshness. |
| 17 | **Role-based feature flags** | Admin can turn features on/off per role (e.g. “Candidates can see ATS fix report”, “Recruiters can bulk apply”). |
| 18 | **Export & backup** | Scheduled export (e.g. candidates, applications, matches) to S3/CSV for compliance and analytics. |

---

## Tier 3 — Best-in-business (differentiation)

*Make the system the “beast” in the segment: conversion, intelligence, and scale.*

| # | Feature | Why it’s best-in-class |
|---|--------|-------------------------|
| 19 | **Predictive “time-to-interview”** | Model: given candidate, job, and market signals → “Estimated days to interview” or “High/Medium/Low likelihood of interview in 14 days”. Surfaces best bets. |
| 20 | **Interview readiness score (global)** | One score per candidate (not per job): “Interview ready on 72% of open roles.” Drives “get to 80%” actions (resume, skills). |
| 21 | **ATS-by-company** | For each job, infer or store “ATS used” (Workday, Greenhouse, etc.). Show candidate “This role uses Greenhouse; your profile is optimized for it.” |
| 22 | **Automated “nudge” campaigns** | Rules: “If candidate has 5+ strong matches and 0 applications in 7 days → send personalized nudge (email/in-app).” Configurable by admin. |
| 23 | **Recruiter AI: next-best-action** | For each assigned candidate: “Suggest: apply to Job X (score 88, similar to last application)” or “Suggest: update resume for Job Y.” |
| 24 | **Diversity & fairness guardrails** | Optional anonymized screening (hide name/photo in first pass); bias checks on JD language; diversity metrics in reports (aggregate only, privacy-safe). |
| 25 | **Multi-tenant / white-label** | Orgs (e.g. staffing firms): separate job/candidate pools, branding, and admin. Single codebase, multi-tenant DB. |
| 26 | **Talent pool & pipelines** | Recruiter/Admin: create pools (“Frontend NYC”, “Senior PM”) and pipelines (“Screening → Interview”); move candidates between stages; match jobs to pools. |
| 27 | **JD intelligence** | Auto-tag: seniority, department, must-haves, nice-to-haves, salary band (if present). Enables “roles like this” and better matching. |
| 28 | **Candidate “market position” report** | “You’re in top 10% for X, bottom 30% for Y; improving Y would unlock N more roles.” Uses match distribution and score bands. |

---

## Tier 4 — Most advanced (industry-leading)

*Features that put the product in a category of its own.*

| # | Feature | Why it’s industry-leading |
|---|--------|----------------------------|
| 29 | **Live ATS simulation** | “Simulate apply to Job X”: run candidate through a mock Workday/Greenhouse flow and return pass/fail + fix list before they apply. |
| 30 | **Continuous matching & real-time alerts** | As soon as a high-scoring job is added (or candidate profile updated), run matching for that slice and notify candidate/recruiter. |
| 31 | **Skill graph & role adjacency** | Graph: skills ↔ roles ↔ jobs. “You’re one skill away from 50 more roles”; “Roles similar to your target” with explainability. |
| 32 | **Compensation intelligence** | Ingest salary bands (from JDs or integrations); show candidate “Market range for this role” and recruiter “Candidate expectation vs band.” |
| 33 | **Video / async interview** | Optional: one-way video or async Q&A; store with application; recruiter reviews in pipeline. |
| 34 | **Integrations hub** | Connectors: Greenhouse, Lever, Workday (read jobs/applications); Gmail/Outlook (log emails); Calendly (interview booking). Webhooks for all key events. |
| 35 | **Explainable match score (full)** | Every dimension (keyword, experience, title, etc.) with 1–2 sentence explanation and “What to change” in UI. Already partly in Elite ATS; expose everywhere. |
| 36 | **Benchmarking & market analytics** | “Your fill rate vs industry”, “Time-to-fill by role family”, “Top sources of hire”. Requires anonymized cross-tenant or external benchmarks. |
| 37 | **Candidate journey analytics** | Funnel: invited → onboarded → first match seen → first application → first interview. Cohort views and drop-off analysis. |
| 38 | **AI recruiter copilot** | Chat: “Who are my best unapplied matches for Senior Engineer?” or “Summarize this candidate for the hiring manager.” Grounded in your data. |

---

## Suggested implementation order (first 90 days)

**Weeks 1–4 (immediate)**  
- Tier 1: #1 (email/templates), #2 (onboarding), #4 (application confirmation), #7 (bulk assign), #8 (cron visibility).

**Weeks 5–8 (important)**  
- Tier 2: #9 (de-dup), #10 (not interested), #12 (bulk actions), #15 (application timeline), #17 (feature flags).

**Weeks 9–12 (differentiation)**  
- Tier 3: #19 (time-to-interview), #21 (ATS-by-company), #22 (nudge campaigns), #27 (JD intelligence), #28 (market position report).

**Beyond 90 days**  
- Tier 3 remaining (#20, #23, #24, #25, #26, #29).  
- Tier 4 in order of strategic value: #29 (live ATS sim), #34 (integrations), #35 (explainable score everywhere), #38 (AI copilot), then #30–33, #36–37.

---

## One-line vision

**Must-have:** Reliable invites, clear onboarding, application receipts, and recruiter bulk actions so daily use is smooth and trustworthy.

**Important:** De-dup, “not interested,” bulk actions, timelines, and feature flags so the product scales and stays maintainable.

**Best-in-business:** Predictive time-to-interview, interview readiness score, ATS-by-company, nudge campaigns, and market position so you lead on conversion and insight.

**Industry-leading:** Live ATS simulation, continuous matching, skill graph, compensation intelligence, integrations, and an AI recruiter copilot so the system is the beast in the market.
