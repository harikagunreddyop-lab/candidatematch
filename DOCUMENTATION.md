# CandidateMatch — Complete Project Documentation

**AI-powered resume generation, job matching, and recruiting platform.**

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Tech Stack](#3-tech-stack)
4. [Project Structure](#4-project-structure)
5. [Environment Setup](#5-environment-setup)
6. [Database Schema](#6-database-schema)
7. [Authentication & Roles](#7-authentication--roles)
8. [Features by Role](#8-features-by-role)
9. [Jobs & Ingest Pipeline](#9-jobs--ingest-pipeline)
10. [API Reference](#10-api-reference)
11. [Cron & Scheduled Tasks](#11-cron--scheduled-tasks)
12. [Deployment](#12-deployment)
13. [Security](#13-security)
14. [Related Docs](#14-related-docs)

---

## 1. Overview

CandidateMatch is a production-ready platform that connects candidates with jobs through:

- **Job matching** — Title-based filtering, skill overlap scoring, ATS scoring
- **Resume generation** — AI (Claude) STAR-format bullets, LaTeX PDF output
- **Application tracking** — Pipeline stages, status updates, reminders
- **Recruiter tools** — Candidate management, AI briefs, pipeline view
- **Job ingestion** — Greenhouse, Lever, Ashby, manual, CSV, LinkedIn/Apify

---

## 2. Architecture

```
┌─────────────────────┐     ┌──────────────────────┐
│   Next.js App       │────▶│   Supabase           │
│   (AWS Amplify)      │     │   Postgres + Auth +  │
│                     │     │   Storage + Realtime │
│  • Admin Panel      │     └──────────────────────┘
│  • Recruiter UX     │
│  • Candidate View   │
│  • API Routes       │
└──────────┬──────────┘
           │
           ├───────────────────────────────┐
           ▼                               ▼
┌─────────────────────┐         ┌──────────────────────┐
│  Resume Worker      │         │  External Services   │
│  (Docker/VPS)       │         │  • Anthropic API     │
│  • Claude API       │         │  • Apify (scraping)  │
│  • LaTeX/Tectonic   │         │  • Greenhouse/Lever  │
│  • PDF generation   │         │  • Gmail OAuth       │
└─────────────────────┘         └──────────────────────┘
```

---

## 3. Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14, React 18, Tailwind CSS |
| Backend | Supabase (Postgres + Auth + Storage + Realtime) |
| AI | Anthropic Claude API |
| Job Boards | Greenhouse, Lever, Ashby APIs |
| Scraping | Apify (LinkedIn, Indeed) |
| PDF | LaTeX + Tectonic, DOCX |
| Worker | Node.js + Fastify |
| Mobile | Capacitor (iOS/Android WebView) |
| Deploy | AWS Amplify (app) + Railway/Render (worker) |

---

## 4. Project Structure

```
candidatematch/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/                # API routes
│   │   │   ├── admin/          # Admin-only APIs
│   │   │   ├── ats/            # ATS scoring, check, bullet-rewrite
│   │   │   ├── auth/           # Auth callback
│   │   │   ├── cron/           # Match, ingest, cleanup
│   │   │   ├── integrations/   # Gmail OAuth
│   │   │   └── ...
│   │   ├── dashboard/          # Role dashboards
│   │   │   ├── admin/          # Admin pages
│   │   │   ├── candidate/      # Candidate pages
│   │   │   └── recruiter/      # Recruiter pages
│   │   └── auth/               # Reset password, etc.
│   ├── components/             # Shared UI components
│   ├── discovery/              # Job board discovery (Greenhouse/Lever/Ashby)
│   ├── ingest/                 # Job sync (adapters, promote, sync)
│   └── lib/                    # Utilities, AI, matching
│       ├── ai/                 # JD intelligence, resume rewriter, etc.
│       ├── matching.ts         # Job–candidate matching
│       └── ...
├── worker/                     # Resume generation worker (separate process)
├── extension/                  # Chrome autofill extension
├── supabase/migrations/        # SQL migrations
├── scripts/                    # importCompanies, migrate, seed
└── docs/                       # Additional documentation
```

---

## 5. Environment Setup

### Required Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon (public) key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role key (server-only) |
| `ANTHROPIC_API_KEY` | Yes | For AI features |
| `RESUME_WORKER_URL` | Yes | URL of resume worker (e.g. `https://...railway.app`) |
| `NEXT_PUBLIC_APP_URL` | Yes | Public app URL (for redirects, mobile) |

### Optional

| Variable | Description |
|----------|-------------|
| `APIFY_API_TOKEN` | For LinkedIn/Indeed scraping |
| `CRON_SECRET` | For cron endpoints (match, ingest, cleanup) |
| `USE_ELITE_ATS` | `1` = use Elite ATS (Claude Batches) for matching |

### Setup

```bash
cp .env.example .env
# Edit .env with your values

npm install
npm run dev
# App at http://localhost:3000
```

### First Admin

1. Sign in via Google or magic link.
2. In Supabase SQL editor:
   ```sql
   UPDATE profiles SET role = 'admin' WHERE email = 'your@email.com';
   ```

---

## 6. Database Schema

### Core Tables

| Table | Purpose |
|-------|---------|
| `profiles` | Users with roles (admin, recruiter, candidate) |
| `candidates` | Candidate profiles, skills, experience, education |
| `jobs` | Job listings (manual, ingest, LinkedIn, Apify) |
| `candidate_job_matches` | Match scores, keywords, ATS breakdown |
| `applications` | Application status (applied, screening, interview, offer, rejected) |
| `resume_versions` | Generated resume PDFs per candidate/job |
| `candidate_resumes` | Uploaded resume files |
| `recruiter_candidate_assignments` | Recruiter ↔ Candidate mapping |

### Job Ingest

| Table | Purpose |
|-------|---------|
| `ingest_connectors` | Connectors (greenhouse/lever/ashby per company) |
| `ingest_jobs` | Raw jobs from connectors |
| `board_discoveries` | Discovery results (company → detected provider) |
| `companies` | Company list (name, website) for discovery |

### Supporting Tables

| Table | Purpose |
|-------|---------|
| `candidate_saved_jobs` | Bookmarked jobs |
| `application_reminders` | Per-application reminders |
| `conversations`, `messages` | Messaging |
| `feature_flags`, `user_feature_flags` | Feature toggles |
| `human_review_requests` | Compliance / apply-on-behalf |
| `calibration_curves` | ATS calibration (score → P(interview)) |

---

## 7. Authentication & Roles

- **Supabase Auth**: Email/password, OAuth (Google, LinkedIn), magic-link invites.
- **Roles**: `admin`, `recruiter`, `candidate`.
- **RLS**: Row-level security on all tables.

| Role | Access |
|------|--------|
| Admin | Full access: users, candidates, jobs, pipeline, settings, compliance |
| Recruiter | Assigned candidates, pipeline, applications, messaging |
| Candidate | Own profile, matches, applications, resumes, saved jobs |

---

## 8. Features by Role

### Candidate

- My Jobs (matches), Applications, Saved Jobs
- ATS score (80+ apply-ready, 61–79 tailor first, ≤60 improve)
- Apply, Tailor Resume, Paste JD & Check ATS
- Profile AI autofill, Resume upload
- Interviews, Skill Report, Reminders, Messages

### Recruiter

- Assigned candidates, Pipeline, Applications
- AI briefs, email drafts, Interview Kit
- Gmail OAuth sync, Messages
- Paste JD & Check ATS (candidate view)

### Admin

- Users (invite, roles, feature flags)
- Candidates (full list, sort, filters, export)
- Jobs (list, add, upload CSV/Excel, Job Boards)
- Pipeline (CSV export), Assignments, Compliance
- Discovery, Connectors, Sync all
- Settings, Audit, Calibration Rebuild

---

## 9. Jobs & Ingest Pipeline

### Job Sources

| Source | How |
|--------|-----|
| **Greenhouse / Lever / Ashby** | Discovery → Connectors → Sync |
| **Manual** | Admin adds job |
| **CSV/Excel** | Admin uploads |
| **LinkedIn / Apify** | Apify actor; jobs go to `jobs` with `dedupe_hash` |

### Discovery (No CSV Required)

1. Admin → Job Boards → Discover from database
2. Uses `companies` table (name, website)
3. Scans career pages, detects Greenhouse/Lever/Ashby
4. Creates `ingest_connectors`, validates

### Sync Flow

1. Cron or manual sync fetches jobs from connector APIs
2. Upserts into `ingest_jobs`
3. `promote.ts` promotes open ingest_jobs → `jobs` (dedupe via `dedupe_hash`)
4. Closed ingest jobs → `jobs.is_active = false`

### CLI

```bash
npm run discovery:run -- --csv ./data/companies.csv --limit 2000
# Or use UI: Discover from database (uses companies table)

npm run ingest:run   # Sync all connectors
```

---

## 10. API Reference

### Admin

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/admin/jobs` | GET | Jobs list + count (server-side, fresh data) |
| `/api/admin/export-candidate` | GET | Export candidate data |
| `/api/admin/calibration/rebuild` | POST | Rebuild calibration curves |
| `/api/admin/send-password-reset` | POST | Send password reset email |
| `/api/admin/elite-eval` | POST | Elite ATS evaluation |

### ATS

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/ats/check` | POST | ATS check for candidate–job pair |
| `/api/ats/check-paste` | POST | Paste JD → ATS check (no limit) |
| `/api/ats/check-batch` | POST | Batch ATS for candidate |
| `/api/ats/bullet-rewrite` | POST | AI improve resume bullets |
| `/api/ats/interview-kit` | POST | AI interview questions |

### Jobs & Discovery

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/discovery/run` | POST | Run discovery (`useCompaniesTable`, csvPath, csvUrl, csvContent) |
| `/api/connectors` | GET | List connectors |
| `/api/connectors/[id]/sync` | POST | Sync single connector |
| `/api/connectors/sync-all` | POST | Sync all connectors |
| `/api/upload-jobs` | POST | Bulk upload jobs |
| `/api/market/jobs` | GET | Market jobs (is_active) |

### Cron (require `Authorization: Bearer <CRON_SECRET>`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/cron/match` | GET | Run job matching |
| `/api/cron/ingest` | GET | Sync connectors |
| `/api/cron/cleanup` | GET | Cleanup tasks |
| `/api/cron/history` | GET | Cron run history |

---

## 11. Cron & Scheduled Tasks

Configure an external cron (e.g. cron-job.org) to call:

- **Match**: `GET /api/cron/match` — run matching (e.g. every 6 hours)
- **Ingest**: `GET /api/cron/ingest` — sync job connectors
- **Cleanup**: `GET /api/cron/cleanup`

Headers: `Authorization: Bearer <CRON_SECRET>`

See [docs/CRON_AMPLIFY.md](docs/CRON_AMPLIFY.md) for AWS EventBridge setup.

---

## 12. Deployment

| Component | Recommended | Notes |
|-----------|-------------|-------|
| Next.js | AWS Amplify | Set all env vars in Amplify console; `amplify.yml` for build |
| Resume worker | Railway / Render | Docker; set `RESUME_WORKER_URL` in Amplify env vars |
| DB + Auth | Supabase | Redirect URLs for app domain |

See [DEPLOYMENT.md](DEPLOYMENT.md).

---

## 13. Security

- **RLS** on all tables
- **Service role** used only server-side (API routes, cron, ingest)
- **Storage**: Private bucket, signed URLs
- **Cron**: Protected by `CRON_SECRET`

---

## 14. Related Docs

| Document | Description |
|----------|-------------|
| [README.md](README.md) | Quick start, architecture diagram |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Deployment guide |
| [docs/CRON_SETUP.md](docs/CRON_SETUP.md) | Cron configuration |
| [docs/AUTHENTICATION.md](docs/AUTHENTICATION.md) | Auth flows |
| [docs/FEATURES_AND_ROADMAP_BY_ROLE.md](docs/FEATURES_AND_ROADMAP_BY_ROLE.md) | Feature list, roadmap |
| [docs/ELITE_AI_ARCHITECTURE.md](docs/ELITE_AI_ARCHITECTURE.md) | AI features, Elite ATS |
| [docs/MOBILE_STORE_DEPLOYMENT.md](docs/MOBILE_STORE_DEPLOYMENT.md) | iOS/Android release |
