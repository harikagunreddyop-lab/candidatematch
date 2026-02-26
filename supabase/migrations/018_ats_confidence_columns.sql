-- ============================================================================
-- 018_ats_confidence_columns.sql
--
-- Adds ATS model versioning + confidence fields to candidate_job_matches.
-- All changes are ADDITIVE — existing rows are unaffected, existing code
-- continues to work unchanged.
--
-- Confidence semantics:
--   ats_confidence  0–100:  overall evidence confidence (NOT the ATS score)
--   ats_confidence_bucket:  human-readable tier for display + gate logic
--   ats_evidence_count:     # of distinct evidence tokens found (keywords etc.)
--   ats_model_version:      scoring engine version (v1 = current production)
--   ats_last_scored_at:     when this row was last fully re-scored
-- ============================================================================

-- ── 1. New columns on candidate_job_matches ──────────────────────────────────

ALTER TABLE public.candidate_job_matches
  ADD COLUMN IF NOT EXISTS ats_model_version      TEXT        NOT NULL DEFAULT 'v1',
  ADD COLUMN IF NOT EXISTS ats_confidence         SMALLINT    CHECK (ats_confidence >= 0 AND ats_confidence <= 100),
  ADD COLUMN IF NOT EXISTS ats_confidence_bucket  TEXT        CHECK (ats_confidence_bucket IN ('insufficient','moderate','good','high')),
  ADD COLUMN IF NOT EXISTS ats_evidence_count     INTEGER,
  ADD COLUMN IF NOT EXISTS ats_last_scored_at     TIMESTAMPTZ;

-- Assumption: candidate_job_matches.id is UUID (matches 001_initial.sql).
-- If ever changed, update ats_events.match_id type below.

COMMENT ON COLUMN public.candidate_job_matches.ats_model_version
  IS 'Scoring engine version tag. v1 = original 8-dim engine. Increment when algorithm changes.';
COMMENT ON COLUMN public.candidate_job_matches.ats_confidence
  IS '0–100 integer: how much evidence backed this score. Low = sparse data, High = rich evidence.';
COMMENT ON COLUMN public.candidate_job_matches.ats_confidence_bucket
  IS 'insufficient(<35), moderate(35-64), good(65-84), high(>=85)';
COMMENT ON COLUMN public.candidate_job_matches.ats_evidence_count
  IS 'Count of distinct keyword/evidence tokens found during last scoring run.';
COMMENT ON COLUMN public.candidate_job_matches.ats_last_scored_at
  IS 'ISO timestamp of the last full ATS re-score. NULL = never fully scored.';

-- ── 2. Shadow scoring columns (for A/B rollout — OFF by default) ─────────────
-- Shadow scores are computed by the new engine but do NOT change gate decisions
-- until the feature flag `elite.confidence_gate` is flipped ON after validation.

ALTER TABLE public.candidate_job_matches
  ADD COLUMN IF NOT EXISTS shadow_ats_score       SMALLINT    CHECK (shadow_ats_score >= 0 AND shadow_ats_score <= 100),
  ADD COLUMN IF NOT EXISTS shadow_ats_confidence  SMALLINT    CHECK (shadow_ats_confidence >= 0 AND shadow_ats_confidence <= 100),
  ADD COLUMN IF NOT EXISTS shadow_ats_breakdown   JSONB,
  ADD COLUMN IF NOT EXISTS shadow_engine_version  TEXT;

COMMENT ON COLUMN public.candidate_job_matches.shadow_ats_score
  IS 'Score computed by the NEW engine (shadow mode). Not used for gating until elite.confidence_gate is ON.';

-- ── 3. Profile tag (A = OPT/agency, C = enterprise/internal mobility) ────────
-- Stored per-match so historical rows remain reproducible even if policy changes.

ALTER TABLE public.candidate_job_matches
  ADD COLUMN IF NOT EXISTS scoring_profile        TEXT        DEFAULT 'A'
    CHECK (scoring_profile IN ('A', 'C'));

COMMENT ON COLUMN public.candidate_job_matches.scoring_profile
  IS 'A = OPT/agency placement (relaxed gate, outreach enabled). C = enterprise internal mobility (governance mode, no hard blocks).';

-- ── 4. Indexes ────────────────────────────────────────────────────────────────

-- Recruiter dashboard: "show me top-scored matches for a job"
CREATE INDEX IF NOT EXISTS idx_matches_job_ats_score
  ON public.candidate_job_matches (job_id, ats_score DESC NULLS LAST);

-- Candidate page: "show me all my matches ranked by score"
CREATE INDEX IF NOT EXISTS idx_matches_candidate_ats_score
  ON public.candidate_job_matches (candidate_id, ats_score DESC NULLS LAST);

-- Stale-score recomputation cron: find rows not scored in N days
CREATE INDEX IF NOT EXISTS idx_matches_last_scored_at
  ON public.candidate_job_matches (ats_last_scored_at NULLS FIRST);

-- Filter dashboard by confidence bucket (low-confidence rows need review)
CREATE INDEX IF NOT EXISTS idx_matches_confidence_bucket
  ON public.candidate_job_matches (ats_confidence_bucket)
  WHERE ats_confidence_bucket IS NOT NULL;

-- ── 5. Seed new elite feature flags (all OFF by default) ─────────────────────
-- Uses the existing feature_flags table from 014_roadmap_features.sql.
-- ON CONFLICT DO NOTHING = idempotent.

INSERT INTO public.feature_flags (key, value, role) VALUES
  ('elite.confidence_gate',    '"false"'::jsonb, NULL),
  ('elite.semantic_similarity','"false"'::jsonb, NULL),
  ('elite.calibration',        '"false"'::jsonb, NULL),
  ('elite.variants',           '"false"'::jsonb, NULL),
  ('elite.outreach_automation','"false"'::jsonb, NULL),
  ('elite.enterprise_governance','"false"'::jsonb, NULL)
ON CONFLICT (key) DO NOTHING;
