# CandidateMatch — Feature Density

**Generated:** 2025-03  
**Purpose:** Relate product surface area (pages, APIs, feature areas) to code size.

---

## 1. Base Metrics

| Metric | Value |
|--------|--------|
| **Total lines of code** | ~44,200 |
| **Source files** (TS/JS/TSX/JSX) | 290 |
| **CSS** | 824 lines |
| **SQL** (migrations) | 2,572 lines |
| **App pages** (route segments with `page.tsx`) | 71 |
| **API route handlers** | ~75 |

---

## 2. Feature Density (per 1,000 LOC)

| Density metric | Formula | Value |
|----------------|---------|--------|
| **Pages per KLOC** | 71 ÷ 44.2 | **~1.6** |
| **API endpoints per KLOC** | 75 ÷ 44.2 | **~1.7** |
| **Surface per KLOC** (pages + API routes) | 146 ÷ 44.2 | **~3.3** |
| **Feature domains per KLOC** | 28 ÷ 44.2 | **~0.63** |

Interpretation: for every 1,000 lines of code, the app exposes about **1.6 pages**, **1.7 API endpoints**, and **~0.6** high-level feature domains.

---

## 3. Feature Domains (28)

Grouped from B2B architecture and API surface:

| # | Domain | Rough scope |
|---|--------|-------------|
| 1 | **Auth & identity** | Login, invite, accept-invite, password reset |
| 2 | **Companies** | CRUD, settings, team |
| 3 | **Jobs** | Create, edit, list, upload, market jobs, hide |
| 4 | **Candidates** | Matches, brief, resumes, export, contact |
| 5 | **Applications** | Submit, timeline, usage, status, notes |
| 6 | **Matches & runs** | Matching engine, run history |
| 7 | **Resumes** | Tailor, analyze, artifacts, candidate-resumes |
| 8 | **ATS** | Check, check-paste, check-batch, pipeline-risk, objection-predictor, interview-kit, explain, apply-decision, bullet-rewrite |
| 9 | **Billing** | Checkout, portal, webhook, company billing |
| 10 | **Autofill** | Profile, mappings, events, resumes, cover-letter |
| 11 | **Cron / ops** | Ingest, match, cleanup, discovery, history |
| 12 | **Admin maintenance** | Ingest, match, cleanup, jobs, elite-eval, calibration, export, send-password-reset |
| 13 | **Connectors & discovery** | Connectors, sync, discovery run |
| 14 | **Integrations** | Gmail auth, sync, disconnect, status, callback |
| 15 | **Compliance** | Compliance dashboard / API |
| 16 | **Activity** | Activity log API |
| 17 | **Feature flags** | Flags API, user flags |
| 18 | **Health & dev** | Health, Sentry test |
| 19 | **Recruiter AI / copilot** | recruiter-ai, copilot/recruiter |
| 20 | **Candidate advice** | candidate/advice |
| 21 | **Auto-apply** | dry-run |
| 22 | **Profile AI** | profile/ai-fill |
| 23 | **Market** | market jobs, skills |
| 24 | **Dashboard roles** | Admin, Company, Recruiter, Candidate (4 role trees) |
| 25 | **Pipeline** | Pipeline views, stage moves |
| 26 | **Messaging** | Conversations, company/candidate messages |
| 27 | **Reports & analytics** | Company analytics, recruiter performance, skill report |
| 28 | **Interviews & scheduling** | Interview dates, compliance |

---

## 4. Density Comparison (rule of thumb)

- **High feature density:** many pages/APIs per KLOC (e.g. >3–4 surface points per KLOC) → thin UI + many endpoints.
- **This app:** ~3.3 surface points per KLOC → **moderate–high** density: substantial UI (71 pages) and many APIs (75) for ~44k LOC.
- **Lower density:** large monoliths with few entry points per KLOC (e.g. <1 page per KLOC).

---

## 5. Summary

| Item | Value |
|------|--------|
| **Total LOC** | ~44,200 |
| **Pages** | 71 |
| **API routes** | ~75 |
| **Feature domains** | 28 |
| **Pages per KLOC** | ~1.6 |
| **APIs per KLOC** | ~1.7 |
| **Feature density** | **Moderate–high** (rich surface per 1k LOC) |
