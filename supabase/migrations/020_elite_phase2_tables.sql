-- ============================================================================
-- 020_elite_phase2_tables.sql
--
-- Phase 2 + 3 persistent storage:
--   A) scoring_runs      — deterministic input snapshots for reproducibility
--   B) calibration_curves — isotonic score→P(interview) per profile + job family
--   C) embeddings_cache   — resume + JD vector storage (pgvector OR jsonb fallback)
--   D) variant_outcomes   — resume variant A/B tracking
--   E) ai_cost_ledger     — token/cost accounting per call
--
-- All tables are gated by feature flags at runtime; the tables themselves
-- always exist (empty) so migrations are safe to run unconditionally.
-- ============================================================================

-- ── A. Scoring runs — deterministic reproducibility ──────────────────────────
-- Every call to computeATSScore() can (optionally) record a snapshot of its
-- inputs.  The inputs_hash is a SHA-256 of the canonical input JSON.
-- Same inputs_hash = same score guaranteed IF model_version is the same.

CREATE TABLE IF NOT EXISTS public.scoring_runs (
  id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  candidate_id    UUID          REFERENCES public.candidates(id)  ON DELETE SET NULL,
  job_id          UUID          REFERENCES public.jobs(id)         ON DELETE SET NULL,
  model_version   TEXT          NOT NULL DEFAULT 'v1',
  scoring_profile TEXT          NOT NULL DEFAULT 'A' CHECK (scoring_profile IN ('A', 'C')),
  -- SHA-256 hex of canonical JSON(sorted-keys) of all scoring inputs
  inputs_hash     TEXT          NOT NULL,
  -- Lightweight snapshot of what went in (not the full resume — just structure)
  inputs_summary  JSONB         NOT NULL DEFAULT '{}'::jsonb,
  -- The output
  total_score     SMALLINT      NOT NULL,
  dimensions_json JSONB         NOT NULL DEFAULT '{}'::jsonb,
  confidence      SMALLINT,
  confidence_bucket TEXT,
  evidence_count  INTEGER
);

CREATE INDEX IF NOT EXISTS idx_scoring_runs_inputs_hash
  ON public.scoring_runs (inputs_hash);
CREATE INDEX IF NOT EXISTS idx_scoring_runs_candidate_job
  ON public.scoring_runs (candidate_id, job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scoring_runs_created
  ON public.scoring_runs (created_at DESC);

COMMENT ON TABLE public.scoring_runs
  IS 'Immutable log of each scoring computation. inputs_hash allows deduplication + exact reproducibility audit.';

-- ── B. Calibration curves — monotonic score→P(interview) ─────────────────────
-- Produced by the offline isotonic regression job (src/lib/calibration/isotonic.ts).
-- One row per (profile, job_family) pair — NULL job_family = global fallback.

CREATE TABLE IF NOT EXISTS public.calibration_curves (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- 'A' or 'C' — matches scoring_profile
  profile       TEXT        NOT NULL CHECK (profile IN ('A', 'C')),
  -- Coarse job family: 'software-engineering', 'data-engineering', etc.
  -- NULL = global fallback used when a specific family has < 30 outcome samples.
  job_family    TEXT        NULL,
  -- Sample counts used to fit this curve
  sample_count  INTEGER     NOT NULL DEFAULT 0,
  outcome_count INTEGER     NOT NULL DEFAULT 0,
  -- The fitted curve: array of {bucket: 0..100 by 5, p: 0..1} objects.
  -- Enforced monotonic by pool-adjacent-violators algorithm.
  bins          JSONB       NOT NULL DEFAULT '[]'::jsonb,
  -- Min samples required before curve is considered reliable.
  -- Below this threshold, callers should return null / show "insufficient data".
  min_reliable_samples INTEGER NOT NULL DEFAULT 30,
  UNIQUE (profile, job_family)
);

COMMENT ON TABLE public.calibration_curves
  IS 'Isotonic regression calibration: maps ATS score bucket → P(interview). Rebuilt weekly by admin route /api/admin/calibration/rebuild.';

-- ── C. Embeddings cache ───────────────────────────────────────────────────────
-- Assumption: pgvector extension MAY NOT be installed (and isn't on many
-- Supabase free-tier projects until explicitly enabled).
--
-- Strategy:
--   PRIMARY storage: embedding_json JSONB — always works, cosine sim in JS.
--   OPTIONAL:        embedding_vec  VECTOR(1536) — added post-hoc if pgvector
--                    is available, enabling ANN search via HNSW index.
--
-- The application layer (semantic-similarity.ts) reads whichever column is
-- non-null, preferring embedding_vec when present.
-- To add pgvector later: run extension + the ALTER TABLE statements below.

-- Resume embeddings (JSONB-only base; vector added conditionally)
CREATE TABLE IF NOT EXISTS public.resume_embeddings (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  resume_id         UUID        NOT NULL REFERENCES public.candidate_resumes(id) ON DELETE CASCADE,
  embedding_model   TEXT        NOT NULL DEFAULT 'text-embedding-3-small',
  -- Primary storage: JSONB float array (always available, cosine sim in JS)
  embedding_json    JSONB         NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (resume_id, embedding_model)
);

CREATE INDEX IF NOT EXISTS idx_resume_embeddings_resume
  ON public.resume_embeddings (resume_id);

-- JD embeddings (same pattern)
CREATE TABLE IF NOT EXISTS public.jd_embeddings (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id            UUID        NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  embedding_model   TEXT        NOT NULL DEFAULT 'text-embedding-3-small',
  embedding_json    JSONB         NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (job_id, embedding_model)
);

CREATE INDEX IF NOT EXISTS idx_jd_embeddings_job
  ON public.jd_embeddings (job_id);

-- ── Optional: add VECTOR column + HNSW index if pgvector is installed ──────────
-- This DO block is safe to run on ANY Supabase project:
--   • If pgvector is NOT installed → skips the entire block silently.
--   • If pgvector IS installed → adds the embedding_vec column and HNSW index.
--   • If the column already exists → ADD COLUMN IF NOT EXISTS is idempotent.
--
-- To enable pgvector on Supabase: run "CREATE EXTENSION IF NOT EXISTS vector;"
-- in the SQL editor, then re-run this migration (or run the block below standalone).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    -- Add vector column to resume_embeddings
    EXECUTE $v$
      ALTER TABLE public.resume_embeddings
        ADD COLUMN IF NOT EXISTS embedding_vec vector(1536) NULL
    $v$;
    -- Add vector column to jd_embeddings
    EXECUTE $v$
      ALTER TABLE public.jd_embeddings
        ADD COLUMN IF NOT EXISTS embedding_vec vector(1536) NULL
    $v$;
    -- Create HNSW ANN indexes
    EXECUTE $v$
      CREATE INDEX IF NOT EXISTS idx_resume_embeddings_hnsw
        ON public.resume_embeddings USING hnsw (embedding_vec vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
    $v$;
    EXECUTE $v$
      CREATE INDEX IF NOT EXISTS idx_jd_embeddings_hnsw
        ON public.jd_embeddings USING hnsw (embedding_vec vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
    $v$;
  END IF;
END $$;

-- ── D. Variant outcomes — resume A/B leaderboard ─────────────────────────────
-- Tracks which resume variant (resume_id) was used for which application,
-- so we can compute interview_rate per variant × job_family.

CREATE TABLE IF NOT EXISTS public.variant_outcomes (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  candidate_id    UUID        NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  resume_id       UUID        NOT NULL REFERENCES public.candidate_resumes(id) ON DELETE CASCADE,
  job_id          UUID        NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  application_id  UUID        REFERENCES public.applications(id) ON DELETE SET NULL,
  -- Job family at time of scoring (denormalised for query speed)
  job_family      TEXT,
  -- Scores at application time (immutable snapshot)
  ats_score       SMALLINT,
  ats_confidence  SMALLINT,
  model_version   TEXT,
  -- Outcome (populated by outcome-recording job)
  outcome         TEXT        CHECK (outcome IN ('interview','offer','hired','rejected','withdrawn','pending')),
  outcome_at      TIMESTAMPTZ,
  UNIQUE (resume_id, job_id)
);

CREATE INDEX IF NOT EXISTS idx_variant_outcomes_resume
  ON public.variant_outcomes (resume_id, outcome);
CREATE INDEX IF NOT EXISTS idx_variant_outcomes_candidate
  ON public.variant_outcomes (candidate_id, outcome);
CREATE INDEX IF NOT EXISTS idx_variant_outcomes_job_family
  ON public.variant_outcomes (job_family, outcome)
  WHERE outcome IS NOT NULL;

-- ── E. AI cost ledger ─────────────────────────────────────────────────────────
-- One row per AI API call or embedding call.
-- Used for: cost dashboards, per-candidate cost attribution, budget gate.

CREATE TABLE IF NOT EXISTS public.ai_cost_ledger (
  id              BIGSERIAL     PRIMARY KEY,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  -- Optional multi-tenancy
  tenant_id       UUID          NULL,

  -- Context
  candidate_id    UUID          NULL REFERENCES public.candidates(id) ON DELETE SET NULL,
  job_id          UUID          NULL REFERENCES public.jobs(id)        ON DELETE SET NULL,

  -- What was called
  call_type       TEXT          NOT NULL,
  -- e.g. 'claude-haiku-4-5-20251001', 'text-embedding-3-small'
  model           TEXT          NOT NULL,

  -- Token counts
  input_tokens    INTEGER       NOT NULL DEFAULT 0,
  output_tokens   INTEGER       NOT NULL DEFAULT 0,

  -- USD cost — computed by caller using published pricing at call time.
  -- Assumption: caller knows model pricing; we store the computed cost, not re-derive it.
  cost_usd        NUMERIC(10,6) NOT NULL DEFAULT 0,

  -- Was this served from cache?
  cache_hit       BOOLEAN       NOT NULL DEFAULT FALSE,

  -- Latency
  duration_ms     INTEGER
);

CREATE INDEX IF NOT EXISTS idx_ai_cost_ledger_created
  ON public.ai_cost_ledger (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_cost_ledger_call_type
  ON public.ai_cost_ledger (call_type);
CREATE INDEX IF NOT EXISTS idx_ai_cost_ledger_candidate
  ON public.ai_cost_ledger (candidate_id)
  WHERE candidate_id IS NOT NULL;

-- Monthly rollup view for cost dashboard
CREATE OR REPLACE VIEW public.ai_cost_monthly AS
SELECT
  date_trunc('month', created_at)   AS month,
  call_type,
  model,
  COUNT(*)                          AS call_count,
  SUM(input_tokens)                 AS total_input_tokens,
  SUM(output_tokens)                AS total_output_tokens,
  SUM(cost_usd)                     AS total_cost_usd,
  AVG(cost_usd)                     AS avg_cost_per_call,
  SUM(CASE WHEN cache_hit THEN 1 ELSE 0 END) AS cache_hits
FROM public.ai_cost_ledger
GROUP BY 1, 2, 3;

-- ── F. Divergence analysis view (shadow scoring QA) ──────────────────────────
CREATE OR REPLACE VIEW public.shadow_score_divergence AS
SELECT
  id                                          AS match_id,
  candidate_id,
  job_id,
  ats_score,
  shadow_ats_score,
  ABS(ats_score - shadow_ats_score)           AS divergence,
  ats_confidence,
  shadow_ats_confidence,
  scoring_profile
FROM public.candidate_job_matches
WHERE shadow_ats_score IS NOT NULL
  AND ats_score IS NOT NULL
ORDER BY divergence DESC;

COMMENT ON VIEW public.shadow_score_divergence
  IS 'QA view: shows score deltas between production engine and shadow engine. Alert if divergence > 15 for > 5% of rows.';
