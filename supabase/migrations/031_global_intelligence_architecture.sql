-- ============================================================================
-- 031_global_intelligence_architecture.sql
--
-- Additive schema for:
--   - Skill ontology graph (skill_nodes, skill_edges)
--   - Talent graph (talent_nodes, talent_edges)
--   - Outcome events (match_events)
--   - Market intelligence (market_skill_trends)
--   - Recruiter performance (recruiter_metrics)
--   - Job intelligence metadata (jobs.job_metadata)
--   - Fraud / resume risk (candidates.fraud_score)
--   - System metrics (system_metrics)
--   - Vector intelligence (candidate_vectors, job_vectors, skill_vectors)
--   - Feature flags for new engines
--
-- All changes are ADDITIVE and safe on existing data.
-- ============================================================================

-- ── 1. Skill Ontology Graph ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.skill_nodes (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  skill_name   TEXT        NOT NULL,
  category     TEXT        NULL,
  embedding    JSONB       NULL,
  parent_skill UUID        NULL REFERENCES public.skill_nodes(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_skill_nodes_name
  ON public.skill_nodes (lower(skill_name));

CREATE TABLE IF NOT EXISTS public.skill_edges (
  from_skill    UUID        NOT NULL REFERENCES public.skill_nodes(id) ON DELETE CASCADE,
  to_skill      UUID        NOT NULL REFERENCES public.skill_nodes(id) ON DELETE CASCADE,
  relation_type TEXT        NOT NULL,
  confidence    NUMERIC     NOT NULL DEFAULT 0.7,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (from_skill, to_skill, relation_type)
);

CREATE INDEX IF NOT EXISTS idx_skill_edges_from
  ON public.skill_edges (from_skill);

CREATE INDEX IF NOT EXISTS idx_skill_edges_to
  ON public.skill_edges (to_skill);


-- ── 2. Talent Graph ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.talent_nodes (
  node_id   UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  node_type TEXT        NOT NULL CHECK (node_type IN ('candidate','company','job','skill','recruiter')),
  metadata  JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_talent_nodes_type
  ON public.talent_nodes (node_type);

CREATE TABLE IF NOT EXISTS public.talent_edges (
  from_node  UUID        NOT NULL REFERENCES public.talent_nodes(node_id) ON DELETE CASCADE,
  to_node    UUID        NOT NULL REFERENCES public.talent_nodes(node_id) ON DELETE CASCADE,
  relation   TEXT        NOT NULL,
  confidence NUMERIC     NOT NULL DEFAULT 0.7,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (from_node, to_node, relation)
);

CREATE INDEX IF NOT EXISTS idx_talent_edges_from
  ON public.talent_edges (from_node);

CREATE INDEX IF NOT EXISTS idx_talent_edges_to
  ON public.talent_edges (to_node);


-- ── 3. Outcome Learning — Match Events ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.match_events (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  candidate_id  UUID        NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  job_id        UUID        NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  recruiter_id  UUID        NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_type    TEXT        NOT NULL,
  metadata      JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_match_events_candidate
  ON public.match_events (candidate_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_match_events_job
  ON public.match_events (job_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_match_events_type
  ON public.match_events (event_type, created_at DESC);


-- ── 4. Market Intelligence ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.market_skill_trends (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  skill        TEXT        NOT NULL,
  demand_score NUMERIC     NOT NULL DEFAULT 0,
  salary_min   NUMERIC     NULL,
  salary_max   NUMERIC     NULL,
  growth_rate  NUMERIC     NULL,
  region       TEXT        NULL,
  as_of        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_market_skill_trends_skill_region
  ON public.market_skill_trends (lower(skill), COALESCE(region, ''));


-- ── 5. Recruiter Performance Metrics ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.recruiter_metrics (
  recruiter_id          UUID        PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  interview_rate        NUMERIC     NULL,
  offer_rate            NUMERIC     NULL,
  time_to_shortlist     NUMERIC     NULL,
  candidate_quality_score NUMERIC   NULL,
  funnel_json           JSONB       NULL,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ── 6. Job Intelligence Metadata + Fraud Score ───────────────────────────────

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS job_metadata JSONB NULL;

ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS fraud_score NUMERIC NULL;


-- ── 7. Vector Intelligence Layer ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.candidate_vectors (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  candidate_id    UUID        NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  embedding_model TEXT        NOT NULL DEFAULT 'text-embedding-3-small',
  embedding_json  JSONB       NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (candidate_id, embedding_model)
);

CREATE INDEX IF NOT EXISTS idx_candidate_vectors_candidate
  ON public.candidate_vectors (candidate_id);

CREATE TABLE IF NOT EXISTS public.job_vectors (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id          UUID        NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  embedding_model TEXT        NOT NULL DEFAULT 'text-embedding-3-small',
  embedding_json  JSONB       NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (job_id, embedding_model)
);

CREATE INDEX IF NOT EXISTS idx_job_vectors_job
  ON public.job_vectors (job_id);

CREATE TABLE IF NOT EXISTS public.skill_vectors (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  skill_node_id   UUID        NOT NULL REFERENCES public.skill_nodes(id) ON DELETE CASCADE,
  embedding_model TEXT        NOT NULL DEFAULT 'text-embedding-3-small',
  embedding_json  JSONB       NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (skill_node_id, embedding_model)
);

CREATE INDEX IF NOT EXISTS idx_skill_vectors_node
  ON public.skill_vectors (skill_node_id);


-- ── 8. System Metrics ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.system_metrics (
  id                 BIGSERIAL   PRIMARY KEY,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metric_name        TEXT        NOT NULL,
  metric_value       NUMERIC     NOT NULL,
  metadata           JSONB       NULL
);

CREATE INDEX IF NOT EXISTS idx_system_metrics_name_time
  ON public.system_metrics (metric_name, created_at DESC);


-- ── 9. Feature flags for new engines ─────────────────────────────────────────

INSERT INTO public.feature_flags (key, value, role) VALUES
  ('engine.resume_intelligence', '"false"'::jsonb, NULL),
  ('engine.market_intelligence', '"false"'::jsonb, NULL),
  ('engine.talent_graph',        '"false"'::jsonb, NULL),
  ('engine.autonomous_apply',    '"false"'::jsonb, NULL),
  ('copilot.recruiter.enabled',  '"false"'::jsonb, 'recruiter'),
  ('advice.candidate.enabled',   '"false"'::jsonb, 'candidate')
ON CONFLICT (key) DO NOTHING;

