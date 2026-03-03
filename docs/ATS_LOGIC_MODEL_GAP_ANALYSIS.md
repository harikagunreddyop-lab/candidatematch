# CandidateMatch vs. Single Best ATS Logic Model — Gap Analysis

**Date:** March 3, 2025  
**Scope:** Structured comparison of current architecture to an ideal ATS logic model with policy-driven decisioning, event-sourced audit, eligibility/ranking separation, HITL, explainability, integrations, and compliance.

---

## 1. Current Architecture Summary

### 1.1 Matching Pipeline

| Component | Status | Details |
|-----------|--------|---------|
| **Title-based matching** | ✅ Implemented | `runMatching()` / `runMatchingForJobs()` in `matching.ts` — domain classification + token overlap, no scoring |
| **Retrieval layer** | ⚠️ Partial | Title match only; no semantic retrieval, LTR, or hybrid retrieval |
| **ATS scoring** | ✅ Implemented | `runAtsCheck()` → `computeATSScore()` (8-dim heuristic); Elite engine available via `USE_ELITE_ATS` |
| **Elite ATS engine** | ✅ Exists | `elite-ats-engine.ts` — batch LLM scoring, cross-ATS validation (10 systems), Layer 1 pre-filter, Layer 3 ranking |
| **Scoring profiles** | ✅ Implemented | Profile A (agency/OPT), Profile C (enterprise); policy engine selects thresholds, weights, governance |
| **Calibration** | ✅ Implemented | `calibration/isotonic.ts` — score→P(interview) via Pool Adjacent Violators; `calibration_curves` table |

### 1.2 Resume Handling

| Component | Status | Details |
|-----------|--------|---------|
| **Ingestion** | ✅ Basic | Upload via `candidate_resumes`, PDF storage; worker parses to `structured_data`, `extracted_skills`, `bullets` |
| **Parsing** | ✅ Implemented | `parseResumeSections()` in ats-engine; AI autofill in `profile/ai-fill`, `autofill/resumes` |
| **Deduplication** | ⚠️ Partial | Jobs: `dedupe_hash` (title+company+location) on upload/scrape; no candidate/resume dedupe |
| **Resume variants** | ✅ Implemented | `resume_versions` for tailored per-job resumes; ATS picks best across variants |
| **Text extraction** | ✅ Implemented | `unpdf` for PDF; `resume_text` column for DOCX tailored resumes |

### 1.3 Dashboards & APIs

| Area | Status | Endpoints / Pages |
|------|--------|-------------------|
| **Candidate** | ✅ | `/dashboard/candidate`, `/skill-report`, `/reports` — matches, apply, ATS breakdown |
| **Recruiter** | ✅ | `/dashboard/recruiter`, pipeline, candidates/[id], reports — ATS check, assignments |
| **Admin** | ✅ | `/dashboard/admin` — jobs, candidates, compliance, audit, feature flags, calibration |
| **ATS check** | ✅ | `POST /api/ats/check` — runs `runAtsCheck`, returns score + breakdown |
| **Matching** | ✅ | `POST /api/matches`, cron `/api/cron/match` |
| **Compliance** | ✅ | `GET/POST /api/compliance` — consent, deletion requests, retention policies |
| **Feature flags** | ✅ | `GET /api/feature-flags`, `hasFeature()` server-side |

---

## 2. Product Principles: Spec vs. Reality

### 2.1 Policy-Driven Decisioning

| Spec Expectation | Reality | Gap |
|------------------|---------|-----|
| **Versioned policy engine** | Two hard-coded profiles (A, C) in `policy-engine.ts`; no DB-backed versioning | ❌ No versioned policies; no policy history or rollback |
| **Policy as config** | Profiles are code constants; thresholds, weights, gate logic embedded | ❌ Cannot change policy without deploy |
| **Tenant-specific policies** | Single-tenant only; `tenant_id` nullable in `ats_events` | ⚠️ Schema ready; logic not multi-tenant |

**What exists:** `getPolicy(profile)`, `evaluateGateDecision()`, `applyFairnessExclusions()`, weight overrides per profile.

---

### 2.2 Event as Source of Truth

| Spec Expectation | Reality | Gap |
|------------------|---------|-----|
| **Event store** | `ats_events` table — append-only, JSONB payload, event_type, candidate/job/match/actor | ✅ Append-only event log exists |
| **CQRS / projections** | `candidate_job_matches` is materialized; no separate read models | ⚠️ No explicit CQRS; materialized views are ad hoc |
| **Audit log** | `audit_log` — consent, deletion, retention; `logAudit` / `logAuditServer` | ✅ Human-action audit; scoring events in `ats_events` |
| **Event replay** | No replay mechanism; events used for calibration/KPIs only | ❌ No event replay or rebuild from events |

**Event types emitted:** `ats_score_computed`, `outcome_interview/offer/hired/rejected`, `candidate_years_discrepancy`, `ats_gate_passed/blocked`, `governance_flag`, `outreach_sent/replied`.

---

### 2.3 Eligibility vs. Ranking Separation

| Spec Expectation | Reality | Gap |
|------------------|---------|-----|
| **Deterministic gates** | `evaluateGateDecision(score, confidenceBucket, policy)` — thresholds by bucket; Profile C never hard-blocks | ✅ Gate is separate from score; `recommend_review` for C |
| **Gate enforcement** | `elite.confidence_gate` flag OFF; gate computed but not enforced in apply flow | ⚠️ Apply block uses raw `ats_score < 50` in applications API, not policy gate |
| **Ranking (scoring)** | Fit score = ATS score; no LTR or learning-to-rank | ❌ Heuristic score only; no LTR model |
| **Retrieval vs. ranking** | Title match = retrieval; ATS score = ranking; no separate retrieval layer | ⚠️ Retrieval is title-based; no semantic/vector retrieval in prod |

**Note:** Apply flow blocks if `ats_score < 50` when ATS check has been run; gate logic is logged in `ats_breakdown.gate_decision` but not used for blocking.

---

### 2.4 Solely Automated Adverse Decisions

| Spec Expectation | Reality | Gap |
|------------------|---------|-----|
| **HITL for adverse** | Apply blocked when score < 50; no explicit "human review required" flow | ❌ No HITL queue; block is hard, not "flag for review" |
| **Notice to candidate** | Error message returned; no structured adverse-action notice | ❌ No NYC AEDT–style notice (reasons, opportunity to correct) |
| **Trace for adverse** | `ats_breakdown` + `ats_reason` stored; `ats_events` has score event | ⚠️ Trace exists but not structured as "decision trace" for compliance |
| **Human override** | Recruiter can apply on behalf of candidate; no formal override audit | ⚠️ Recruiter apply bypasses candidate-side block; no override audit trail |

**Gap:** No dedicated adverse-decision workflow with notice, appeal, or HITL routing.

---

### 2.5 Reasons-First Explainability

| Spec Expectation | Reality | Gap |
|------------------|---------|-----|
| **Bounded reasons** | 8 dimensions with score + details; keyword matched/missing lists | ✅ Dimensions are bounded; keyword lists are explicit |
| **Evidence links** | Dimension details describe why; no citation to resume/jd snippets | ⚠️ No "evidence spans" or snippet links |
| **Model/policy versions** | `ats_model_version`, `scoring_profile` in breakdown; `ats_breakdown.model_version` | ✅ Version and profile stored |
| **UI explainability** | `AtsBreakdownPanel` — dimensions, matched/missing keywords, "why lower" | ✅ Strong explainability UI |
| **Resume fix report** | Elite engine has `generateResumeFixReport()`; not wired to main flow | ⚠️ Elite-only; not in standard `runAtsCheck` path |

---

### 2.6 Integrations

| Spec Expectation | Reality | Gap |
|------------------|---------|-----|
| **Canonical contracts** | No defined API contracts for ATS ingest/egress | ❌ No public webhook or integration SDK |
| **Webhooks** | None | ❌ No outbound webhooks (e.g., on apply, status change) |
| **OAuth / SCIM / SAML** | Supabase Auth: Google/LinkedIn OAuth, magic links | ✅ OAuth for login; no SCIM/SAML for HRIS |
| **ATS sync** | Jobs from scrape/upload; no live ATS sync | ❌ No Workday, Greenhouse, Lever, etc. sync |

---

### 2.7 Compliance Evidence

| Spec Expectation | Reality | Gap |
|------------------|---------|-----|
| **Generated vs. manual** | Consent, deletion, retention managed in admin UI; audit_log for actions | ✅ Admin-driven; some automation (e.g., deletion execution) |
| **Scoring reproducibility** | `scoring_runs` table + `inputs_hash`; `always_write_scoring_run` for Profile C | ❌ **`scoring_runs` never written** — table exists, policy expects it, but `runAtsCheck` does not insert |
| **Bias / fairness** | `applyFairnessExclusions()` for Profile C (visa scrubbing); no bias metrics | ⚠️ Scrubbing exists; no disparity analysis or fairness dashboard |

---

## 3. Core Functional Logic Alignment

### 3.1 Ingestion, Parsing, Dedupe

| Function | Status | Notes |
|----------|--------|-------|
| **Job ingestion** | ✅ | Upload + scrape; `dedupe_hash` prevents exact duplicates |
| **Resume ingestion** | ✅ | PDF/DOCX upload; worker parses; `structured_data` cached |
| **JD extraction** | ✅ | `extractJobRequirements()` — AI, cached in `jobs.structured_requirements` |
| **Candidate dedupe** | ❌ | No duplicate candidate detection |
| **Resume dedupe** | ❌ | Multiple resumes per candidate; no "same resume" detection |

### 3.2 Matching / Scoring

| Function | Status | Notes |
|----------|--------|-------|
| **Eligibility gates** | ⚠️ | Policy gates exist; apply flow uses raw score, not gate |
| **Retrieval** | ⚠️ | Title-based only; semantic similarity / embeddings in schema but gated by flags |
| **LTR vs. heuristic** | Heuristic | 8-dim weighted heuristic; no LTR |
| **Scoring profile** | ✅ | A vs. C; weights, gate thresholds, governance differ |

### 3.3 Ranking, Scheduling, Offer, Onboarding

| Function | Status | Notes |
|----------|--------|-------|
| **Ranking** | ✅ | Matches ordered by `fit_score` / `ats_score` |
| **Scheduling** | ✅ | `applications.interview_date`; reminders |
| **Offer** | ✅ | `applications.status` = offer; `offer_details` JSONB |
| **Onboarding** | ⚠️ | Invite flow, profile completion; no formal onboarding pipeline |

---

## 4. AI/ML & Governance

### 4.1 LLM Usage

| Use Case | Extraction vs. Decisioning | Location |
|----------|----------------------------|----------|
| **JD requirements** | Extraction | `extractJobRequirements()` — cached |
| **Soft factors (8%)** | Decisioning | `scoreSoftFactors()` — 1 call per candidate×job |
| **Profile autofill** | Extraction | `profile/ai-fill`, `autofill/resumes` |
| **Elite scoring** | Decisioning | Full score + cross-ATS validation — batch LLM |
| **Tailored resume** | Generation | Worker builds DOCX from template + AI content |

**Governance:** AI calls logged to `ai_cost_ledger` (model, tokens, cost); `logAiCall()` in telemetry.

### 4.2 Fairness Monitoring

| Capability | Status |
|------------|--------|
| **Protected attribute exclusion** | ✅ Profile C: `applyFairnessExclusions()` scrubs visa string |
| **Bias metrics** | ❌ No disparity analysis, no fairness dashboard |
| **Anonymized screening** | ❌ Name/photo visible in first pass |
| **Diversity metrics** | ❌ Roadmap item (#24); not implemented |

### 4.3 Model Versioning

| Capability | Status |
|------------|--------|
| **Engine version** | ✅ `ats_model_version` = 'v1'; stored in `candidate_job_matches`, `ats_breakdown` |
| **Shadow scoring** | ✅ Columns exist; `elite.confidence_gate` etc. for rollout |
| **Calibration curves** | ✅ Per profile + job family; rebuilt via `/api/admin/calibration/rebuild` |

### 4.4 HITL Rules

| Capability | Status |
|------------|--------|
| **Low-score review queue** | ❌ No queue; recruiter sees low scores in candidate list |
| **Override with reason** | ❌ Recruiter can apply; no "override reason" field |
| **Human-in-loop for reject** | ❌ Automated block at score < 50; no HITL before block |

---

## 5. Compliance Readiness

### 5.1 NYC AEDT (Automated Employment Decision Tools)

| Requirement | Status | Gap |
|-------------|--------|-----|
| **Bias audit** | ❌ | No annual bias evaluation or public report |
| **Candidate notice** | ❌ | No structured notice before use; no "right to request human review" |
| **Independent audit** | ❌ | No third-party audit or documented methodology |
| **Data retention for audit** | ⚠️ | `ats_events`, `candidate_job_matches` retain data; no defined retention for AEDT |

### 5.2 GDPR

| Requirement | Status | Gap |
|-------------|--------|-----|
| **Consent** | ✅ | `consent_records`, `privacy_policy_accepted_at`, `data_processing_consent` |
| **Right to deletion** | ✅ | `data_deletion_requests`, admin execute; cascade deletes |
| **Right to access** | ⚠️ | No self-service export; admin export exists |
| **Data portability** | ⚠️ | No standard export format |
| **Retention policies** | ✅ | `data_retention_policies`; admin configurable |

### 5.3 EU AI Act

| Requirement | Status | Gap |
|-------------|--------|-----|
| **Transparency** | ✅ | Explainability (breakdown, dimensions, keywords) |
| **Human oversight** | ❌ | No HITL for adverse; no human review before block |
| **Accuracy / robustness** | ⚠️ | Calibration exists; no robustness testing framework |
| **Documentation** | ⚠️ | `docs/ats-engine-internals.md`; no formal technical documentation for regulators |
| **Risk classification** | ❌ | No explicit "limited risk" / "high risk" classification |

---

## 6. Summary: Priority Gaps

### Critical (blocks trust / compliance)

1. **`scoring_runs` not written** — Policy expects it for Profile C; table exists but `runAtsCheck` never inserts.
2. **No HITL for adverse decisions** — Automated block at score < 50; no human review, notice, or appeal.
3. **Apply flow ignores policy gate** — Uses raw `ats_score < 50` instead of `evaluateGateDecision()`.
4. **NYC AEDT / EU AI Act** — No bias audit, candidate notice, or human oversight.

### High (limits enterprise readiness)

5. **No versioned policy engine** — Policies hard-coded; no DB config or history.
6. **No structured adverse-action notice** — No reasons + appeal path for blocked candidates.
7. **No scoring_runs integration** — Implement writes for Profile C and governance flag.
8. **No bias / fairness monitoring** — No disparity analysis or fairness dashboard.

### Medium (differentiation)

9. **No webhooks / integrations** — No outbound events or canonical contracts.
10. **No LTR** — Heuristic scoring only.
11. **No evidence spans** — Explainability good but no citation to resume/JD snippets.
12. **No HRIS sync** — OAuth for login; no SCIM/SAML for org sync.

---

## 7. Search Index (Keywords Found)

| Keyword | Location(s) |
|---------|-------------|
| `runAtsCheck` | `matching.ts`, `api/ats/check/route.ts` |
| `elite-ats-engine` | `elite-ats-engine.ts`, `docs/ats-engine-internals.md` |
| `matching` | `matching.ts`, `api/matches`, `api/cron/match` |
| `candidate_job_matches` | Many — core match table |
| `ats_events` | `telemetry.ts`, migration 019 |
| `policy-engine` | `policy-engine.ts`, `matching.ts` |
| `feature-flags` | `feature-flags-server.ts`, `api/feature-flags`, `api/ats/check` |
| `scoring_profile` | `matching.ts`, `policy-engine.ts`, migrations 018, 020 |
| `ats_breakdown` | `matching.ts`, `AtsBreakdownPanel`, candidate_job_matches |
| `decision_trace` | ❌ Not present — gate_decision in breakdown, no formal "trace" |
| `audit` | `audit.ts`, `audit_log`, compliance route |
| `bias` | Roadmap; `applyFairnessExclusions` (not "bias" by name) |
| `calibration` | `calibration/isotonic.ts`, `api/admin/calibration/rebuild` |

---

*Generated from codebase exploration. "Single Best ATS Logic Model" spec was not found in-repo; analysis uses common ATS best-practice principles.*
