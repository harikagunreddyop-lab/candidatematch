# Elite AI Architecture — CandidateMatch

Roadmap for AI features across 11 domains. **Deterministic scoring and gating remain unchanged** — AI augments, never replaces.

---

## PART 1 — ATS & Resume Layer

| # | Feature | Status | Location |
|---|---------|--------|----------|
| 1 | JD Intelligence Engine | ✅ Implemented | `lib/ai/jd-intelligence.ts` |
| 2 | Resume Evidence Analyzer | ✅ Implemented | `lib/ai/resume-evidence-analyzer.ts` |
| 3 | Intelligent Resume Rewriter | ✅ Implemented | Enhanced `api/ats/bullet-rewrite`, `lib/ai/resume-rewriter.ts` |
| 4 | Interview Objection Predictor | ✅ Implemented | `lib/ai/objection-predictor.ts`, `api/ats/objection-predictor` |

---

## PART 2 — Application Strategy

| # | Feature | Status | Location |
|---|---------|--------|----------|
| 5 | Job Prioritization Optimizer | 🟡 Planned | AI suggests; deterministic ranking |
| 6 | Employer Intent Detection | 🟡 Planned | Hiring velocity, reposts, signals |
| 7 | Smart Apply Decision Engine | ✅ Implemented | `lib/ai/apply-decision.ts` (use from UI or matching) |

---

## PART 3 — Recruiter Intelligence

| # | Feature | Status | Location |
|---|---------|--------|----------|
| 8 | Recruiter Performance Optimizer | 🟡 Planned | Conversion patterns, timing |
| 9 | AI Candidate Brief Generator | ✅ Exists | `api/recruiter-ai` (brief, email) |
| 10 | Pipeline Risk Detection | ✅ Implemented | `lib/ai/pipeline-risk.ts`, `api/ats/pipeline-risk` |

---

## PART 4 — Placement & Forecasting

| # | Feature | Status | Location |
|---|---------|--------|----------|
| 11 | Placement Probability Engine | ✅ Implemented | `lib/ai/placement-probability.ts` + calibration |
| 12 | Resume Variant Performance | ✅ Exists | `variant_outcomes` table, calibration |

---

## PART 5 — Skill & Career

| # | Feature | Status | Location |
|---|---------|--------|----------|
| 13 | Skill Gap Prescription | ✅ Partial | Fix report + candidate brief |
| 14 | Career Trajectory Planner | 🟡 Planned | Pivot feasibility, market trends |

---

## PART 6 — Extension & Autofill

| # | Feature | Status | Location |
|---|---------|--------|----------|
| 15 | Smart Question Answering | 🟡 Planned | Visa, salary, relocation |
| 16 | Adaptive Form Mapping | 🟡 Planned | ATS platform learning |

---

## PART 7 — Messaging & Outreach

| # | Feature | Status | Location |
|---|---------|--------|----------|
| 17 | Recruiter Outreach Optimization | ✅ Partial | `api/recruiter-ai` type=email |
| 18 | Candidate Communication Coach | 🟡 Planned | Follow-up, negotiation |

---

## PART 8 — Enterprise & Compliance

| # | Feature | Status | Location |
|---|---------|--------|----------|
| 19 | Bias Detection & Fairness | 🟡 Planned | Skill weighting audit |
| 20 | Explainability AI Layer | ✅ Implemented | `lib/ai/explainability.ts` (human-readable ATS reasoning) |

---

## PART 9–11 — Revenue, Market, Agents

| # | Feature | Status |
|---|---------|--------|
| 21–22 | Tier Optimization, Revenue Forecasting | 🟡 Planned |
| 23 | Market Trend AI | 🟡 Planned |
| 24–31 | Autonomous AI Agents | 🟡 Architecture ready |

---

## Where AI Is NOT Used

- **Final ATS score** — deterministic
- **Apply gate** — deterministic
- **Billing / compliance enforcement** — deterministic
