-- ============================================================================
-- 030_elite_ats_matching_v3.sql
--
-- Additive-only changes for ATS v3 + matching v3:
--   - candidate_skill_index / job_skill_index (skill retrieval index)
--   - jobs: requirements metadata
--   - candidates: normalized profile cache
--   - candidate_job_matches: tiers, versions, calibration, breakdown, gates
--
-- All changes are ADDITIVE (no drops/renames) and safe to run on existing data.
-- ============================================================================

-- ── 1. Skill index tables ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.candidate_skill_index (
  candidate_id UUID      NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  skill        TEXT      NOT NULL,
  weight       NUMERIC   NOT NULL DEFAULT 1,
  evidence_e   NUMERIC   NULL, -- 0..1 evidence strength (optional)
  source       TEXT      NULL, -- 'bullet' | 'project' | 'list' | 'inferred'
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (candidate_id, skill)
);

CREATE INDEX IF NOT EXISTS idx_csi_skill
  ON public.candidate_skill_index (skill);

CREATE INDEX IF NOT EXISTS idx_csi_candidate
  ON public.candidate_skill_index (candidate_id);


CREATE TABLE IF NOT EXISTS public.job_skill_index (
  job_id   UUID      NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  skill    TEXT      NOT NULL,
  is_must  BOOLEAN   NOT NULL DEFAULT FALSE,
  weight   NUMERIC   NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (job_id, skill)
);

CREATE INDEX IF NOT EXISTS idx_jsi_skill
  ON public.job_skill_index (skill);

CREATE INDEX IF NOT EXISTS idx_jsi_job
  ON public.job_skill_index (job_id);


-- ── 2. Jobs: requirements metadata ────────────────────────────────────────────

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS requirements_version       INTEGER      NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS requirements_extracted_at  TIMESTAMPTZ  NULL,
  ADD COLUMN IF NOT EXISTS requirements_quality       JSONB        NULL;


-- ── 3. Candidates: normalized profile cache ───────────────────────────────────

ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS candidate_profile_norm JSONB        NULL,
  ADD COLUMN IF NOT EXISTS profile_version        INTEGER      NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS profile_updated_at     TIMESTAMPTZ  NULL;


-- ── 4. candidate_job_matches: ATS v3 + matching tiers ─────────────────────────

ALTER TABLE public.candidate_job_matches
  ADD COLUMN IF NOT EXISTS match_tier          TEXT       NOT NULL DEFAULT 'match'
    CHECK (match_tier IN ('match','shortlist','autoapply')),
  ADD COLUMN IF NOT EXISTS p_interview         NUMERIC    NULL,
  ADD COLUMN IF NOT EXISTS ats_version         INTEGER    NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS weights_version     INTEGER    NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS calibration_version INTEGER    NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS ats_breakdown_v3    JSONB      NULL,
  ADD COLUMN IF NOT EXISTS evidence_spans      JSONB      NULL,
  ADD COLUMN IF NOT EXISTS negative_signals    JSONB      NULL,
  ADD COLUMN IF NOT EXISTS gate_core_passed    BOOLEAN    NULL,
  ADD COLUMN IF NOT EXISTS gate_core_reason    TEXT       NULL,
  ADD COLUMN IF NOT EXISTS gate_policy_passed  BOOLEAN    NULL,
  ADD COLUMN IF NOT EXISTS gate_policy_reason  TEXT       NULL,
  ADD COLUMN IF NOT EXISTS score_computed_at   TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Note: keep existing ats_breakdown column from earlier migrations intact.
-- ats_breakdown_v3 is used for the new engine; UIs can read either.

-- Indexes to support candidate-first ranking and per-job ranking
CREATE INDEX IF NOT EXISTS idx_cjm_candidate_tier_score
  ON public.candidate_job_matches (candidate_id, match_tier, p_interview DESC NULLS LAST, ats_score DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_cjm_job_score
  ON public.candidate_job_matches (job_id, p_interview DESC NULLS LAST, ats_score DESC NULLS LAST);

