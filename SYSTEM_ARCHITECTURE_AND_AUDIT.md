# CandidateMatch — Complete System Architecture & Feature Audit

**Report Date:** March 2025  
**Scope:** Current implemented system only (no roadmap or future features)

---

## 1. SYSTEM OVERVIEW

CandidateMatch is an AI-powered recruiting platform that:

1. **Ingests jobs** from Greenhouse, Lever, Ashby, Adzuna APIs, CSV/Excel uploads, and manual entry. Jobs are deduplicated and promoted into a single `jobs` table.

2. **Matches candidates to jobs** using title compatibility, domain classification, skill overlap (via `candidate_skill_index` and `job_skill_index`), and ATS scoring. Matches are stored in `candidate_job_matches`.

3. **Scores candidates with ATS** — a deterministic, evidence-grounded multi-dimensional scorer (v2). Claude is used for JD extraction and bullet rewriting, not for score numbers. Gates (must-have skills, confidence) control apply eligibility.

4. **Generates tailored resumes** via a separate Resume Worker. The worker uses Claude for STAR bullets and produces DOCX output, uploaded to Supabase Storage.

5. **Tracks applications** with pipeline stages: ready, applied, screening, interview, offer, rejected, withdrawn. Candidates apply, recruiters move stages, reminders can be set.

6. **Provides role-specific dashboards** — Admin (users, jobs, connectors, compliance), Recruiter (assigned candidates, pipeline, briefs), Candidate (matches, applications, ATS check, tailor).

7. **Includes a Chrome extension** for autofilling job application forms using the candidate’s profile (Ctrl+Shift+F).

---

## 2. TECHNICAL ARCHITECTURE

### Architecture Flow Diagram (ASCII)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           NEXT.JS APP (AWS Amplify)                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ Admin Pages │  │Recruiter UX │  │Candidate UX │  │ API Routes          │ │
│  │ Jobs, Users │  │ Pipeline    │  │ Matches     │  │ /api/ats/*          │ │
│  │ Connectors  │  │ Candidates  │  │ Applications│  │ /api/applications   │ │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  │ /api/cron/*         │ │
│         │                │                │         │ /api/admin/*        │ │
│         └────────────────┴────────────────┴─────────┴──────────┬──────────┘ │
│                                                               │             │
└───────────────────────────────────────────────────────────────┼─────────────┘
                                                                │
        ┌───────────────────────┬───────────────────────────────┼───────────────────┐
        │                       │                               │                   │
        ▼                       ▼                               ▼                   ▼
┌───────────────┐    ┌─────────────────────┐         ┌─────────────────┐  ┌──────────────┐
│   SUPABASE    │    │  RESUME WORKER      │         │  ANTHROPIC      │  │   CHROME     │
│ Postgres      │    │  (Railway/Render)   │         │  Claude API     │  │   EXTENSION  │
│ Auth          │◀───│  Port 3001          │────────▶│  JD extraction  │  │   Autofill   │
│ Storage       │    │  Fastify            │         │  Bullet rewrite │  │   Ctrl+Shift+F│
│ Realtime      │    │  DOCX generation    │         │  Briefs         │  └──────┬───────┘
└───────────────┘    └─────────────────────┘         └─────────────────┘       │
        ▲                       ▲                               ▲               │
        │                       │                               │               │
        └───────────────────────┴───────────────────────────────┴───────────────┘
```

### Component Summary

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Frontend** | Next.js 14 App Router, React 18, Tailwind CSS | Dashboards, forms, real-time updates |
| **Backend** | Next.js API routes, Supabase (Postgres, Auth, Storage) | API, data persistence, auth |
| **Worker** | Node.js, Fastify, pdf-lib, DOCX builder | Resume generation (Claude + DOCX) |
| **Database** | Supabase Postgres | All tables, RLS |
| **APIs** | REST (Next.js route handlers) | ATS, applications, connectors, cron |
| **External** | Anthropic Claude, Greenhouse/Lever/Ashby APIs, Gmail OAuth | AI, job boards, email |
| **Extension** | Chrome Manifest v3, content script, service worker | Autofill on job sites |
| **Cron** | AWS EventBridge Scheduler | Calls /api/cron/* endpoints on schedule; CRON_SECRET auth |
| **Queues** | BullMQ + Redis (optional) | JD extraction queue when REDIS_URL set; cron triggers ingest/match/cleanup/discovery |
| **AI** | Anthropic Claude (Haiku/Sonnet) | JD extraction, bullet rewrite, briefs, interview kit |

---

## 3. DATABASE STRUCTURE

### Core Tables

| Table | Columns (key) | Indexes | Relationships | Role |
|-------|---------------|---------|---------------|------|
| **profiles** | id, name, email, role, avatar_url, phone, title, company, linkedin_url, is_active, ... | idx_profiles_role, idx_profiles_email | FK from auth.users | Users with role (admin/recruiter/candidate) |
| **candidates** | id, full_name, email, user_id, primary_title, secondary_titles, skills, experience, education, target_roles, parsed_resume_text, ... | idx_candidates_user_id, idx_candidates_active | profiles(user_id), profiles(assigned_recruiter_id) | Candidate profiles; linked to auth user |
| **jobs** | id, source, source_job_id, title, company, location, url, jd_raw, jd_clean, dedupe_hash, is_active, ingest_job_id, structured_requirements, ... | idx_jobs_dedupe_hash, idx_jobs_source, idx_jobs_ingest_job_id | ingest_jobs(ingest_job_id) | Canonical job listings from all sources |
| **candidate_job_matches** | id, candidate_id, job_id, fit_score, matched_keywords, missing_keywords, ats_score, ats_breakdown, best_resume_id | idx_matches_candidate, idx_matches_job, idx_matches_score | candidates, jobs, candidate_resumes | Match scores, ATS results, keywords |
| **applications** | id, candidate_id, job_id, resume_version_id, status, applied_at | idx_applications_candidate, idx_applications_status | candidates, jobs, resume_versions | Application pipeline tracking |
| **candidate_resumes** | id, candidate_id, pdf_path, structured_data, bullets | idx_candidate_resumes_candidate | candidates | Uploaded resume PDFs |
| **resume_versions** | id, candidate_id, job_id, pdf_path, bullets, generation_status | idx_resume_versions_candidate, idx_resume_versions_status | candidates, jobs | AI-tailored DOCX resumes |

### Job Ingest Tables

| Table | Columns (key) | Indexes | Role |
|-------|---------------|---------|------|
| **ingest_connectors** | id, provider, source_org, is_enabled, sync_interval_min, last_run_at | UNIQUE(provider, source_org) | Connectors (greenhouse/lever/ashby/adzuna) |
| **ingest_jobs** | id, provider, source_org, source_job_id, title, description_text, status (open/closed) | idx_ingest_jobs_provider_org_status | Raw jobs from connectors before promotion |
| **board_discoveries** | id, company_name, website, detected_provider, validated | idx_board_discoveries_company | Discovery log |
| **companies** | name, website | (assumed) | Company list for discovery; populated by script |

### Supporting Tables

| Table | Purpose |
|-------|---------|
| recruiter_candidate_assignments | Recruiter ↔ Candidate mapping |
| candidate_saved_jobs | Bookmarked jobs |
| application_reminders | Per-application reminders |
| conversations, conversation_participants, messages | Messaging |
| scrape_runs | Legacy scraping tracking |
| cron_run_history | Cron match run logs |
| application_status_history | Application status audit |
| feature_flags, user_feature_flags | Feature toggles |
| human_review_requests | Compliance / apply-on-behalf |
| calibration_curves | ATS score → P(interview) |
| candidate_skill_index, job_skill_index | Skill overlap for matching |
| gmail_connections, email_activity | Gmail OAuth sync |
| application_field_mappings, application_fill_events | Extension autofill mapping/telemetry |

---

## 4. JOB INGEST PIPELINE

### Sources and Flow

| Source | Entry Point | Flow |
|--------|-------------|------|
| **Greenhouse** | Discovery → Connector → Sync | List jobs API → detail → normalize → upsert ingest_jobs → promote |
| **Lever** | Discovery → Connector → Sync | Same as Greenhouse |
| **Ashby** | Discovery → Connector → Sync | Same as Greenhouse |
| **Adzuna** | Manual connector (provider=adzuna, source_org=country) | Search API by country; requires ADZUNA_APP_ID/ADZUNA_APP_KEY |
| **Apify / LinkedIn** | CSV/Excel upload (Admin) | Upload jobs parsed from Apify export → insert jobs with dedupe_hash |
| **CSV upload** | Admin Job Boards, Upload | POST /api/upload-jobs with rows → dedupe by hash → insert jobs |
| **Manual** | Admin Add Job | Insert directly into jobs |

### Discovery Process

1. **Input**: Companies from `companies` table (`useCompaniesTable: true`) or CSV (path/URL/content).
2. **Scans** career paths: `/careers`, `/jobs`, `/company/careers`, `/about/careers`, `/work-with-us`.
3. **Detects** Greenhouse, Lever, Ashby via HTML patterns (`discovery/patterns.ts`).
4. **Validates** each detected board via API probe (`discovery/validate.ts`).
5. **Inserts** `board_discoveries` and upserts `ingest_connectors` for validated boards.

### Connectors

- Stored in `ingest_connectors`: `(provider, source_org)` unique.
- `sync_interval_min` (default 60) and `last_run_at` determine when cron syncs.
- Adapters in `ingest/adapters/`: `greenhouse.ts`, `lever.ts`, `ashby.ts`, `adzuna.ts` (source_org = country code; requires ADZUNA_APP_ID/ADZUNA_APP_KEY).

### Ingest Flow (sync.ts)

1. Fetch job list from provider API.
2. For each job: fetch detail, normalize, upsert into `ingest_jobs` (`provider, source_org, source_job_id`).
3. Jobs not in current list → mark `status='closed'` in ingest_jobs.
4. Call `promoteIngestJobs` for all open ingest jobs for that connector.
5. Call `deactivateClosedJobs` for closed ingest jobs.

### Promotion (promote.ts)

Promotion from `ingest_jobs` to `jobs`:

1. **Already promoted**: Job has `ingest_job_id` → update title, location, jd, last_seen_at.
2. **Exists by source**: Job has `(source, source_job_id)` → update and link `ingest_job_id`.
3. **Dedupe by hash**: Job has same `dedupe_hash` (manual/LinkedIn) → link `ingest_job_id`, update source.
4. **Insert new**: Create new job row with `source`, `source_job_id`, `dedupe_hash`, `ingest_job_id`, `is_active: true`.

### Deduplication Logic

- **dedupe_hash** = SHA256 of `title|source_org|location|description_slice(500)`.
- Used to avoid duplicates between ingest jobs and manual/LinkedIn jobs.
- Upload jobs: same hash + optional `(source, source_job_id)` check.

---

## 5. MATCHING ENGINE

### Filtering

1. **Active candidates**: `candidates.active = true`.
2. **Active jobs**: `jobs.is_active = true`.
3. **Title compatibility**: `isTitleMatch` checks candidate `primary_title`, `secondary_titles`, `target_roles` vs job title.
4. **Domain compatibility**: Job domain (e.g. `software-engineering`, `data-science`) must be in `DOMAIN_COMPATIBILITY` with candidate domains.
5. **Assignment filter** (recruiter context): Only assigned candidates.

### Scoring Logic

- **Skill overlap** (when `matching.v3.enabled`): Uses `candidate_skill_index` and `job_skill_index`; overlap = Σ min(candidate_weight, job_weight) / job_total.
- **Fit score** (0–100): Blends title match, skill overlap, and ATS score.
- **ATS integration**: `runAtsCheck` computes ATS score; stored in `candidate_job_matches.ats_score`, `ats_breakdown`.

### Ranking

- Matches ordered by `fit_score DESC`, then `ats_score DESC`.
- `MAX_MATCHES_PER_CANDIDATE` cap (default 500) limits rows per candidate.

### candidate_job_matches Table

Stores: `fit_score`, `matched_keywords`, `missing_keywords`, `match_reason`, `ats_score`, `ats_breakdown`, `best_resume_id`, `gate_passed`, `ats_model_version`.

---

## 6. ATS SCORING ENGINE

### Dimensions (ats-scorer-v2)

| Dimension | Weight | Description |
|-----------|--------|-------------|
| parse | 0.06 | Resume formatting, sections, dates, bullets |
| must | 0.30 | Must-have skills (evidence-grounded) |
| nice | 0.06 | Nice-to-have skills |
| resp | 0.26 | Responsibility matching (semantic) |
| impact | 0.14 | Impact metrics in bullets |
| scope | 0.07 | Experience scope/tenure |
| recent | 0.05 | Role recency (τ by domain) |
| domain | 0.04 | Title/domain alignment |
| risk | 0.02 | Negative signals (job hop, gaps) |

### Scoring Rules

- **Must-have gate**: `theta_must = 0.35`; up to `allowed_missing_must = 1` tolerated.
- **Evidence**: Skills must be evidenced in bullets; list-only gets capped credit.
- **Responsibility**: Semantic similarity (cosine) between resume bullets and JD responsibilities.
- **Impact**: Top 18 bullets scored for metrics (revenue, %, scale).
- **Confidence**: Separate 0–1 confidence; affects gate thresholds via policy.

### Parsing

- **JD**: Claude extracts structured requirements (`ats-engine.ts` `extractJobRequirements`). Cached in `jobs.structured_requirements`.
- **Resume**: Text from PDF (unpdf) or DOCX; bullets from `candidate_resumes.bullets` / `experience.responsibilities`.

### Policy Profiles

- **Profile A** (OPT/agency): Lenient gate, outreach automation on.
- **Profile C** (Enterprise): Gate never hard-blocks; `recommend_review` for human review.

---

## 7. RESUME SYSTEM

### AI Bullet Rewriting

- **API**: `POST /api/ats/bullet-rewrite`.
- **Input**: Candidate resume bullets, target job JD.
- **Output**: Improved bullets with [METRIC_NEEDED]/[TOOL_NEEDED] placeholders.
- **Uses**: Claude via `lib/ai/resume-rewriter.ts`.

### Resume Tailoring

- **Flow**: Candidate clicks "Tailor Resume" → `resume_versions` row created → Next.js calls Worker `/generate`.
- **Worker**: Fetches candidate + job, calls Claude for STAR bullets + summary, builds DOCX via `buildAtsDocx`, uploads to Storage, updates `resume_versions`.

### LaTeX / DOCX

- **Current**: Worker outputs DOCX (not LaTeX). Uses `worker/ats-docx-builder.js`.
- **Storage**: Supabase Storage bucket `resumes`; path stored in `resume_versions.pdf_path` (stores .docx path).

### Resume Storage

- `candidate_resumes`: Uploaded PDFs (or parsed).
- `resume_versions`: Tailored DOCX per candidate/job.
- Download: Signed URLs from Storage.

---

## 8. APPLICATION SYSTEM

### Apply Links

- Job `url` if valid; else fallback to LinkedIn job search URL by title+company (`lib/job-url.ts`).

### Application Tracking

- **Create**: Candidate applies → INSERT into `applications` (status `applied` or `ready`).
- **Update**: Recruiter/admin moves status; `application_status_history` records changes.

### Pipeline Stages

- `ready`, `applied`, `screening`, `interview`, `offer`, `rejected`, `withdrawn`.

### Reminders

- `application_reminders` table: `candidate_id`, `application_id`, `remind_at`.
- UI: Add/remove per application.

---

## 9. BROWSER EXTENSION

### How Autofill Works

1. **Activation**: Ctrl+Shift+F or popup "Activate".
2. **Content script** detects form fields (input, select, textarea) with labels, ids, names.
3. **Fingerprint**: djb2 hash of `label|name|id|type|options` for stable mapping.
4. **Mapping**: Heuristic + saved mappings (`application_field_mappings`) map fingerprint → profile key.
5. **Fill**: Fills text, email, tel, url, number, textarea, select, radio, checkbox (radio/checkbox only at confidence ≥80%).

### Safety Guarantees

- Never fills password fields.
- Never clicks submit or auto-submits.
- Never bypasses CAPTCHA.
- Only fills standard form field types.

### Permissions

- `storage`, `activeTab`, `scripting`, `host_permissions: <all_urls>`.

### Communication with Backend

- **Auth**: User connects via `/connect-extension`; session token stored in extension storage.
- **APIs**: `GET /api/autofill-profile`, `GET/POST /api/autofill/mappings`, `POST /api/autofill/events`, `GET /api/autofill/resumes`, `POST /api/autofill/resumes/download`.
- **Headers**: `Authorization: Bearer <token>`.

### Security Model

- Token in extension storage; 401 triggers re-auth banner.
- Backend validates JWT; recruiter role restricted for some endpoints.
- Resume download requires `confirmed: true` in body.

---

## 10. ROLE PERMISSIONS

| Capability | Admin | Recruiter | Candidate |
|------------|-------|-----------|-----------|
| Users: invite, roles, flags | ✅ | ❌ | ❌ |
| Candidates: full list, export | ✅ | Assigned only | Own |
| Jobs: CRUD, upload, connectors | ✅ | ❌ | ❌ |
| Job boards: discovery, sync | ✅ | ❌ | ❌ |
| Pipeline, applications | ✅ | Assigned | Own |
| Run matching | ✅ | ❌ | ❌ |
| ATS check (any candidate) | ✅ | Assigned | Own |
| Apply, tailor, save jobs | ✅ | ❌ | ✅ (own) |
| Gmail integration | ❌ | ✅ | ❌ |
| Compliance, human review | ✅ | ✅ | Request only |
| Messages | ✅ | Participants | Participants |

---

## 11. CRON / AUTOMATION

| Endpoint | Schedule | Auth | Purpose |
|----------|----------|------|---------|
| `GET /api/cron/match` | Every 6 hours | Bearer CRON_SECRET | Run matching (incremental by default; full fallback if no new jobs) |
| `GET /api/cron/ingest` | Hourly | Bearer CRON_SECRET | Sync due ingest connectors |
| `GET /api/cron/discovery` | Daily (optional) | Bearer CRON_SECRET | Auto-discover job boards from companies table |
| `GET /api/cron/cleanup` | Daily 03:00 UTC | Bearer CRON_SECRET | Delete stale applications (ready/applied/screening, no status history for 21+ days) |

**Scheduling:** These endpoints are passive HTTP handlers. They do NOT self-trigger — they must be called by an external scheduler. In production on AWS Amplify, use **AWS EventBridge Scheduler** (see `docs/CRON_AMPLIFY.md`). If EventBridge is not configured, use the manual fallbacks listed below.

### Trigger Matrix

| Subsystem | Auto? | Trigger | Auth | Manual Fallback |
|---|---|---|---|---|
| **Job Ingest** | Conditional | EventBridge → `GET /api/cron/ingest` (hourly) | CRON_SECRET | `POST /api/admin/maintenance/ingest` (admin JWT) or `POST /api/connectors/sync-all` (admin JWT) |
| **Discovery** | Conditional | EventBridge → `GET /api/cron/discovery` (daily) | CRON_SECRET | `POST /api/discovery/run` (admin JWT, useCompaniesTable or CSV) |
| **Matching** | Conditional | EventBridge → `GET /api/cron/match` (every 6h) | CRON_SECRET | `POST /api/admin/maintenance/match` (admin JWT) or `GET /api/matches` / Admin Dashboard "Run Matching" |
| **Matching** | **Yes** | On resume upload (`POST /api/candidate-resumes`) | User JWT | — (automatic, fire-and-forget) |
| **Matching** | **Yes** | On CSV job upload (`POST /api/upload-jobs`) | Admin JWT | — (automatic, scoped to new jobs) |
| **Cleanup** | Conditional | EventBridge → `GET /api/cron/cleanup` (daily 03:00 UTC) | CRON_SECRET | `POST /api/admin/maintenance/cleanup` (admin JWT) or Admin Dashboard "Run Cleanup" |
| **Resume Generation** | **No** | User action: Tailor Resume button | User JWT | Click "Tailor Resume" in candidate/recruiter UI |
| **Auto-apply (dry-run)** | Conditional | EventBridge → `GET /api/auto-apply/dry-run` (if flag ON) | CRON_SECRET or admin JWT | N/A — dry run only, no real submissions |

> **Note:** All `cron_run_history` rows include a `mode` field that distinguishes cron vs admin/manual vs job-specific modes (e.g. `cron`, `cron_ingest`, `incremental`, `admin_manual`) so every invocation is auditable regardless of trigger source.

---

## 12. CURRENT FEATURES

### Candidate

- Dashboard, profile edit, resume upload (PDF)
- My Jobs (matches), Applications, Saved Jobs
- ATS score bands (80+ green, 61–79 amber, ≤60 red)
- Apply (gate ATS ≥80), Tailor Resume (61–79)
- Paste JD & Check ATS, ATS breakdown, bullet rewrite
- Match "why", job age badge
- Onboarding checklist, waiting page (invite flow)
- Connect Extension (Ctrl+Shift+F)
- Profile AI autofill
- Interviews list, Skill report
- Human review request, reminders, pipeline view, messages, reports

### Recruiter

- Assigned candidates, search, filters
- Candidate detail: profile, matches, applications, resumes
- Paste JD & Check ATS, ATS Check Batch
- Pipeline, status updates
- AI brief, email draft, Interview Kit
- Resume upload (for candidate)
- Gmail OAuth, sync, disconnect
- Messages, reports

### Admin

- Users: invite, roles, per-user feature flags
- Candidates: full list, sort, filters, export
- Jobs: list, add, upload CSV/Excel, Job Boards
- Discovery from companies table, Sync all connectors
- Pipeline, CSV export
- Applications, Assignments
- Compliance, human review
- Calibration rebuild, send password reset
- Admin jobs API (server-side fetch)
- Audit, Settings

---

## 13. CURRENT LIMITATIONS

| Category | Limitation |
|----------|------------|
| **Integrations** | No direct Apify API; LinkedIn/Indeed jobs via CSV upload only. No Workday/Lever native apply. |
| **Performance** | Matching is synchronous; no queue. Amplify 300s function timeout for large runs. PDF text extraction can be slow. |
| **Data quality** | JD extraction depends on Claude; short JDs get minimal requirements. Companies table may be missing migration. |
| **Security** | Extension has `<all_urls>`; token in extension storage. No rate limiting on most APIs. |
| **Scaling** | No Redis/cache; no job queue; matching and ingest run in-process. |
| **Observability** | Basic logging; no APM or structured tracing. |

---

## 14. SCALABILITY ANALYSIS

| Scale | Behavior | Bottlenecks |
|-------|----------|-------------|
| **10k users** | Likely fine on AWS Amplify + Supabase. Matching runs within 300s window. | Single-region Supabase; no read replicas. |
| **100k users** | Matching may exceed 5min. Ingest cron could hit time limits with many connectors. | Need worker offload for matching; batch processing. |
| **1M users** | Current design will not scale. | DB connection limits, no sharding, no CDN for static assets, no queue. |

**Recommendations**: Offload matching to a worker with Bull/Redis; use read replicas for Supabase; add caching for job/candidate lists; consider job queue for resume generation.

---

## 15. SECURITY MODEL

| Layer | Implementation |
|-------|----------------|
| **Auth** | Supabase Auth (email/password, OAuth, magic link). JWT in cookies. |
| **RLS** | All tables have RLS. Jobs: SELECT all. Candidates: admin/recruiter all, candidate own. Matches, applications, resumes: role-based. |
| **API** | `requireAdmin`, `requireApiAuth` with role check. Cron: `validateCronAuth` (Bearer CRON_SECRET). |
| **Extension** | JWT in storage; backend validates. Never fills passwords; no auto-submit. |
| **Storage** | Private bucket; signed URLs for downloads. |

---

## 16. DEPLOYMENT

| Component | Hosting | Notes |
|-----------|---------|-------|
| **Next.js** | AWS Amplify | Auto-deploy from Git. Env vars in Amplify console. `amplify.yml` handles build. |
| **Worker** | Railway / Render | Docker from `worker/`. Set `RESUME_WORKER_URL` in Amplify env vars. |
| **DB** | Supabase | Managed Postgres, Auth, Storage. |
| **CI/CD** | AWS Amplify | Git push → build → deploy. No separate GitHub Actions. |
| **Environments** | Single prod typically | `.env` for local; Amplify env for prod. |
| **Crons** | AWS EventBridge Scheduler | Calls `/api/cron/*` endpoints. See `docs/CRON_AMPLIFY.md`. |

---

*End of report.*
