# Complete ATS Scoring Logic — CandidateMatch

This document describes **all** ATS scoring paths in the codebase: the main deterministic engine (v2), the legacy v1 scorer, the policy/gate layer, and the optional Elite ATS path.

---

## 1. Overview: Which Scorer Runs When

| Entry point | Scorer used | When |
|-------------|-------------|------|
| **Single ATS check** (`runAtsCheck` in `matching.ts`) | `computeATSScore` → **ats-scorer-v2** | Recruiter/candidate runs “Check ATS” for one candidate×job |
| **Paste JD check** (`runAtsCheckPasted`) | Same | User pastes JD text; no stored job |
| **Batch ATS** (`runAtsCheckBatch`) | Same, once per resume variant; best score kept | Multiple resumes scored, best persisted |
| **Background match job** | Either v2 or **elite-ats-engine** | Depends on `USE_ELITE_ATS`; elite path uses LLM + cross-ATS validation |
| **Legacy / worker** | **ats-scorer.ts** (v1) | Used in worker/fast-generator; not the primary API path |

The **primary production path** is: **Job requirements** (cached or AI-extracted) → **ats-scorer-v2** (deterministic) → **policy engine** (gate by profile + confidence) → persist `ats_score`, `ats_breakdown`, `gate_passed`, etc.

---

## 2. Job Requirement Extraction (Input to Scoring)

**Source:** `extractJobRequirements()` in `ats-engine.ts` (Claude Haiku).  
**Caching:** Result stored in `jobs.structured_requirements`; subsequent checks reuse it (no extra AI call).

**Extracted structure (`JobRequirements`):**

- **must_have_skills** — Explicitly required tech/tools (e.g. “required”, “must have”).
- **nice_to_have_skills** — “Preferred”, “bonus”, “plus”.
- **implicit_skills** — Implied by role (e.g. “Senior React Developer” → JavaScript, HTML, CSS, Git).
- **min_years_experience**, **preferred_years_experience** — Numbers or null.
- **seniority_level** — intern | junior | mid | senior | staff | principal | lead | manager | director.
- **required_education**, **preferred_education_fields** — Degree level and fields.
- **certifications** — List of cert names.
- **location_type** — remote | hybrid | onsite.
- **location_city**, **visa_sponsorship** — For location/visa logic.
- **domain** — e.g. software-engineering, frontend, data-engineering, devops, qa, general.
- **industry_vertical** — fintech, healthtech, saas, etc.
- **behavioral_keywords**, **context_phrases** — For behavioral/semantic use.
- **responsibilities** — 3–5 core job duties (used for responsibility↔resume alignment).

If extraction fails, scoring cannot run; `getOrExtractRequirements()` in `matching.ts` returns null and the API errors.

---

## 3. Main Scorer: ats-scorer-v2 (Evidence-Grounded, Deterministic)

**File:** `src/lib/ats-scorer-v2.ts`.  
**Function:** `computeATSScoreV2(input, options?)`.  
**Design:** No LLM for score numbers. Skills count only when **evidenced** (bullets/projects/skills list); must-haves act as gates; responsibility match is semantic + grounded.

### 3.1 Constants

- **theta_must = 0.35** — Must-have “met” only if skill credit ≥ this (allows list-only skills to clear with evidence ≈ 0.40).
- **allowed_missing_must = 1** — Gate blocks only if more than one must-have is missing.
- **sim_min = 0.55** — Responsibility similarity below this = unmatched.
- **sim_good = 0.70** — Strong responsibility match.
- **related_credit_cap = 0.45** — Related-but-not-exact skill (e.g. Java vs Kotlin) capped at this.
- **top_bullets_p = 18** — Only top 18 bullets used for impact scoring (limits resume bloat gaming).

### 3.2 Skill Credit (Per-JD-Skill)

For each JD skill (must + nice):

1. **Candidate skill map** — Built from:
   - Profile `skills` and `tools` (canonicalized).
   - Resume sections: skills, summary, experience, projects, education (see `parseSkillSections`).
   - Synonym groups: if any term in a group appears in bullets/skills, the canonical skill is added.

2. **Evidence strength E(s)** per candidate skill:
   - Counts: occurrences in **bullets**, **projects**, **skills list**.
   - Work evidence: `E_bullet = 1 - exp(-0.6 * bullet_count)`, `E_proj = 1 - exp(-0.4 * project_count)`; combined **0.7×bullet + 0.3×project**.
   - If skill is in skills list: floor **0.40** (list-only not zero).
   - If both list and bullet: small corroboration bonus (+0.10, cap 1.0).
   - **List-only** (no bullet/project): E capped at **0.55**.

3. **Recency** — Months since last use of skill in experience; decay `exp(-months/τ)` with τ by role family (e.g. 18 months for engineering, 30 for QA/management). Profile-listed skills with no bullet use get recency = 1 (current).

4. **Match quality Q** (JD skill vs candidate canonical):
   - Exact match: **1.0**.
   - Alias match: **0.9**.
   - Related skill: **related_credit_cap (0.45)**.
   - Else **0**.

5. **Credit for JD skill s:** `credit(s) = max over candidate skills of (Q × E × recency)`.

### 3.3 Component Scores (All 0–100)

| Component | Weight (W_V2) | Description |
|-----------|----------------|-------------|
| **parse** | 0.06 | Resume structure: section presence (skills, experience, education, summary), date count, bullet count, contact + LinkedIn/GitHub. |
| **must** | 0.30 | Must-have coverage. Blended: 60% match rate (fraction of must-haves with credit ≥ theta_must) + 40% average credit. **Gate:** `gate_passed` iff `missing_must.length ≤ allowed_missing_must`. |
| **nice** | 0.06 | Average credit over nice-to-have skills. |
| **resp** | 0.26 | JD responsibilities ↔ resume bullets. Uses `bulletsResponsibilitiesSim` when provided (semantic); else **keyword overlap proxy** (JD keywords vs bullet text, stopwords removed). Grounded by shared evidence (JD skills present in bullets/skills). Penalty if adjusted sim < sim_min. |
| **impact** | 0.14 | Quality of top P bullets: action verbs, object phrases, tool mentions, metrics (%, $, “reduced”, “increased”), multi-metric bullets. |
| **scope** | 0.07 | Years fit (within min/preferred range = 1.0; under/over with gentle penalty), leadership phrases, scale phrases (million, 10k+, etc.). |
| **recent** | 0.05 | Recency of must- and nice-to-have skills (average of per-skill recency used in credit). |
| **domain** | 0.04 | Role/domain alignment: candidate titles vs job domain regex (data-engineering, data-science, backend, frontend, fullstack, devops, mobile, qa, security). Only applied when domain ≠ general. |
| **risk** | 0.02 | Inverse of reduction from overlapping roles, job-hop rate, career gaps. |

Weights are renormalized by their sum (so total weight = 1). Domain weight is 0 when domain is general.

### 3.4 Negative Signals (No Direct Weight; Used in risk / explainability)

- **Overlapping roles** — Employment periods overlap.
- **Career gap** — Gap > 12 months between roles.
- **Job hopping** — High roles-per-year (e.g. > 1.5 with ≥ 4 roles).
- **Inflated seniority** — Senior title with &lt; 5 years experience.
- **Generic language** — Buzzwords (synergy, leverage, thought leader, etc.).

### 3.5 Final Score and Band

- **raw** = weighted sum of component scores (each sanitized for NaN).
- **total_score** = `round(clip(raw, 0, 100))`.
- **Band:** elite (≥90), strong (≥80), possible (≥70), weak (&lt;70).
- **Confidence** (0–1): blend of parse quality, must-have evidence quality, responsibility sim, impact fraction.

### 3.6 Outputs

- **total_score**, **confidence**, **band**.
- **gate_passed**, **gate_reason** (e.g. “Gate passed — 4/5 must-haves met” or “Gate blocked — missing: X, Y”).
- **matched_must**, **missing_must**, **matched_nice**, **missing_nice**.
- **evidence_spans** — Matched skills linked to resume snippets.
- **negative_signals** (if any).
- **skill_credits** (Map) for explainability.

---

## 4. ats-engine.ts — Public API and Semantic Similarity

**File:** `src/lib/ats-engine.ts`.

- **computeATSScore(jobTitle, jobDesc, requirements, candidateData, options?)**  
  Builds `ScorerInput` from `candidateData` and calls **computeATSScoreV2** with optional **bulletsResponsibilitiesSim**.

- **bulletsResponsibilitiesSim** — When feature flag `elite.semantic_similarity` is on, `matching.ts` calls `computeSemanticSimilarity()` (embeddings or LLM) for resume bullets vs JD responsibilities and passes the result into v2. That value is used in **C_resp** instead of the keyword-overlap proxy.

So the **same v2 formula** runs; only the **responsibility dimension** can be upgraded from keyword overlap to semantic similarity when the flag is set and data is available.

---

## 5. Policy Engine and Gate (After Scoring)

**File:** `src/lib/policy-engine.ts`.

Scoring profile is chosen in `runAtsCheck` (default **A**). Policy supplies:

- **Gate thresholds by confidence bucket** (score must meet threshold to “pass”):
  - **Profile A (OPT / Agency):** insufficient 38, moderate 48, good 52, high 57.
  - **Profile C (Enterprise):** insufficient 45, moderate 55, good 60, high 65.
- **Confidence bucket** from v2 confidence (0–1) mapped to 0–100 then:
  - &lt; 35 → insufficient, 35–64 → moderate, 65–84 → good, ≥ 85 → high.
- **evaluateGateDecision(atsScore, confidenceBucket, policy)**:
  - Profile A: **passes** = (atsScore ≥ threshold); can hard-block.
  - Profile C: **passes** is always true; **recommend_review** = true when below threshold (no hard block; human review).

So **ATS score is purely from v2**; the **gate** is a separate policy layer that can block (A) or only flag (C) based on score and confidence.

---

## 6. Matching.ts: Resume Resolution and Persistence

**File:** `src/lib/matching.ts`.

- **Resume text source** (priority): tailored `resume_version` → explicit `resumeId` → `candidate_job_matches.best_resume_id` → latest candidate resume → `candidate.parsed_resume_text`.
- **Candidate data** — Experience, skills, tools, education, certifications, location, visa, years_of_experience, resume_text. For Profile C, **applyFairnessExclusions** may strip protected attributes before scoring.
- **getOrExtractRequirements(job)** — Returns cached `job.structured_requirements` or calls **extractJobRequirements** and caches.
- **Optional semantic similarity** — If `elite.semantic_similarity` flag and bullets + JD responsibilities exist, **computeSemanticSimilarity** is called and result passed as **bulletsResponsibilitiesSim** into **computeATSScore**.
- **Result** — `ats_score`, `ats_reason`, `ats_breakdown`, `gate_passed`, `gate_reason`, `matched_keywords`, `missing_keywords`, confidence bucket, fix report. Written to `candidate_job_matches` and optionally to `scoring_runs` (e.g. Profile C). **ATS cache** keyed by candidate, job, model version, resume id, JD length can skip recomputation.

---

## 7. Legacy Scorer: ats-scorer.ts (v1)

**File:** `src/lib/ats-scorer.ts`.  
**Function:** `calculateATSScore(job, resume, candidate)`.

Used in worker/fast-generator and any path that has **StructuredJob** + **StructuredResume** (e.g. with embeddings). Not used by the main API path that uses v2.

**Weights:**

- Title alignment: **20%**
- Must-have skills coverage: **40%** (binary: matched count / must-have count × 100)
- Nice-to-have: **15%**
- Semantic similarity (cosine job vs resume embedding): **10%** (50 if no embeddings)
- Seniority fit (years vs requirement): **10%**
- Formatting: **5%** (resume.atsFormattingScore or 80)

**Penalties (subtracted from raw):**

- **Domain mismatch** (candidate title vs job title domain incompatibility): up to **50**.
- **Missing must-have:** **15 per** missing skill.
- **Visa mismatch:** **30**.
- **Location mismatch** (non-remote job, city/state): **20**.
- **Years gap** &gt; 5: **min(25, gap × 2)**.

**Decision bands:** ready (≥85), optimize (≥70), rewrite (≥40), reject (&lt;40).

**Skill matching:** Direct + synonym map (e.g. javascript/js, react/reactjs, aws/amazon web services, kubernetes/k8s). No evidence/recency; pure set overlap.

---

## 8. Elite ATS Engine (Optional, LLM + Cross-ATS)

**File:** `src/lib/elite-ats-engine.ts`.  
**When:** Used when **USE_ELITE_ATS=1** (e.g. background match job).

**Goal:** Score that reflects both “true fit” and “will pass 10 major ATS systems” (Workday, Taleo, iCIMS, SuccessFactors, Greenhouse, Lever, SmartRecruiters, Workable, BambooHR, Manatal). **82+** only if both genuine fit and all systems clear.

**Flow:**

1. **Pre-filter** — Domain compatibility, min years, visa/location; exclude clearly irrelevant pairs.
2. **Per candidate×job×resume variant:** One **Claude** call with a long prompt that:
   - Scores 8 dimensions (0–100) with reasoning:
     - **keyword** (0.30), **experience** (0.18), **title** (0.14), **education** (0.08), **location** (0.08), **formatting** (0.07), **behavioral** (0.07), **soft** (0.08).
   - Returns **matched_keywords**, **missing_keywords**, **match_reason**, **red_flags**.
   - Returns **cross_ats**: per-system pass/fail, blocking_issues, keyword_gaps, fix_instructions, **all_systems_clear**, **guaranteed_interview_ready**, **resume_fix_priority**, **optimized_resume_suggestions**.
3. **Cross-ATS gate:** If **any** system fails, formatting is capped at 69 and total capped below 82.
4. **Total** = weighted sum of the 8 dimensions; **interview_ready** = (total ≥ 82 and cross_ats.all_systems_clear).
5. **Ranking** — Optional second LLM pass over top candidates for comparative notes and recruiter email.

Output is compatible with **candidate_job_matches** (fit_score, match_reason, matched_keywords, missing_keywords, score_breakdown with cross_ats).

---

## 9. Skill Ontology and Canonicalization

**File:** `src/lib/skill-ontology.ts`.

- **SYNONYM_GROUPS** — 70+ groups (e.g. javascript/js/ecmascript, react/reactjs, aws/amazon web services, kubernetes/k8s). First element = canonical.
- **canonicalize(s)** — Normalize to canonical form.
- **getAliases(s)** — Return aliases for a canonical skill.
- **getRelated(s)** — Related skills for expansion/explainability.
- **SKILL_IMPLICATIONS** — Not used in v2; used in older keyword expansion (e.g. “distributed systems” → microservices, kafka).

v2 uses **matchQuality** (exact / alias / related) and **evidence strength** from bullets, projects, and skills list; ontology drives canonicalization and related credit cap.

---

## 10. Summary Table

| Aspect | ats-scorer-v2 (main) | ats-scorer (v1) | Elite ATS |
|--------|----------------------|------------------|-----------|
| **Used by** | runAtsCheck, runAtsCheckPasted, runAtsCheckBatch | Worker / fast-generator | Background match when USE_ELITE_ATS=1 |
| **LLM** | JD extraction only (cached); optional semantic sim for resp | None for score | Full dimension + cross-ATS per pair |
| **Score range** | 0–100 | 0–100 | 0–100 |
| **Gate** | must-have missing ≤ 1 (gate_passed) | N/A | 82+ and all_systems_clear |
| **Policy gate** | Yes (Profile A/C by confidence) | No | No (separate product) |
| **Evidence** | Bullets + projects + skills list; recency; list-only capped | Set overlap + synonyms | LLM judgment |
| **Bands** | elite/strong/possible/weak | ready/optimize/rewrite/reject | interview_ready 82+ |

---

*Last updated from codebase: ats-engine.ts, ats-scorer-v2.ts, ats-scorer.ts, elite-ats-engine.ts, matching.ts, policy-engine.ts, skill-ontology.ts.*
