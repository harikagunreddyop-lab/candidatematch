-- 062_company_pipeline_and_talent.sql
-- Pipeline stages, pipeline history, AI candidate scores, talent pools.

-- Ensure profiles has company_id (get_user_company() used in RLS below)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;

-- pipeline_stages: customizable per company, ordered
CREATE TABLE IF NOT EXISTS public.pipeline_stages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  stage_name TEXT NOT NULL,
  stage_order INT NOT NULL,
  stage_color TEXT,
  status_key TEXT CHECK (status_key IS NULL OR status_key IN ('ready', 'applied', 'screening', 'interview', 'offer', 'rejected', 'withdrawn')),
  auto_move_rules JSONB DEFAULT '[]',
  sla_hours INT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, stage_order)
);

CREATE INDEX IF NOT EXISTS idx_pipeline_stages_company ON public.pipeline_stages(company_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_stages_active ON public.pipeline_stages(company_id, is_active) WHERE is_active = true;

ALTER TABLE public.pipeline_stages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_members_pipeline_stages" ON public.pipeline_stages;
CREATE POLICY "company_members_pipeline_stages" ON public.pipeline_stages
  FOR ALL USING (company_id = public.get_user_company());

DROP POLICY IF EXISTS "platform_admin_pipeline_stages" ON public.pipeline_stages;
CREATE POLICY "platform_admin_pipeline_stages" ON public.pipeline_stages
  FOR ALL USING (public.is_platform_admin());

-- applications: optional link to pipeline stage (when set, overrides status for pipeline UI)
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS current_stage_id UUID REFERENCES public.pipeline_stages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_applications_current_stage ON public.applications(current_stage_id) WHERE current_stage_id IS NOT NULL;

-- candidate_pipeline_history: track moves between stages
CREATE TABLE IF NOT EXISTS public.candidate_pipeline_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  from_stage TEXT,
  to_stage TEXT NOT NULL,
  from_stage_id UUID REFERENCES public.pipeline_stages(id) ON DELETE SET NULL,
  to_stage_id UUID REFERENCES public.pipeline_stages(id) ON DELETE SET NULL,
  moved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  moved_at TIMESTAMPTZ DEFAULT NOW(),
  duration_in_previous_stage_hours INT,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_candidate_pipeline_history_application ON public.candidate_pipeline_history(application_id);
CREATE INDEX IF NOT EXISTS idx_candidate_pipeline_history_moved_at ON public.candidate_pipeline_history(moved_at DESC);

ALTER TABLE public.candidate_pipeline_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_members_pipeline_history" ON public.candidate_pipeline_history;
CREATE POLICY "company_members_pipeline_history" ON public.candidate_pipeline_history
  FOR ALL USING (
    application_id IN (
      SELECT a.id FROM public.applications a
      JOIN public.jobs j ON j.id = a.job_id AND j.company_id = public.get_user_company()
    )
  );

DROP POLICY IF EXISTS "platform_admin_pipeline_history" ON public.candidate_pipeline_history;
CREATE POLICY "platform_admin_pipeline_history" ON public.candidate_pipeline_history
  FOR ALL USING (public.is_platform_admin());

-- ai_candidate_scores: per candidate per job, one row per day
CREATE TABLE IF NOT EXISTS public.ai_candidate_scores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  candidate_id UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  overall_score INT CHECK (overall_score >= 0 AND overall_score <= 100),
  skill_match_score INT CHECK (skill_match_score IS NULL OR (skill_match_score >= 0 AND skill_match_score <= 100)),
  experience_match_score INT CHECK (experience_match_score IS NULL OR (experience_match_score >= 0 AND experience_match_score <= 100)),
  culture_fit_score INT CHECK (culture_fit_score IS NULL OR (culture_fit_score >= 0 AND culture_fit_score <= 100)),
  salary_alignment_score INT CHECK (salary_alignment_score IS NULL OR (salary_alignment_score >= 0 AND salary_alignment_score <= 100)),
  likelihood_to_accept INT CHECK (likelihood_to_accept IS NULL OR (likelihood_to_accept >= 0 AND likelihood_to_accept <= 100)),
  reasoning JSONB DEFAULT '{}',
  scored_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique per candidate+job+day (UTC date so index expression is immutable)
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_candidate_scores_unique_day ON public.ai_candidate_scores (
  candidate_id,
  job_id,
  ((scored_at AT TIME ZONE 'UTC')::date)
);
CREATE INDEX IF NOT EXISTS idx_ai_candidate_scores_candidate_job ON public.ai_candidate_scores(candidate_id, job_id);
CREATE INDEX IF NOT EXISTS idx_ai_candidate_scores_job ON public.ai_candidate_scores(job_id);
CREATE INDEX IF NOT EXISTS idx_ai_candidate_scores_scored_at ON public.ai_candidate_scores(scored_at DESC);

ALTER TABLE public.ai_candidate_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_members_ai_scores" ON public.ai_candidate_scores;
CREATE POLICY "company_members_ai_scores" ON public.ai_candidate_scores
  FOR ALL USING (
    job_id IN (SELECT id FROM public.jobs WHERE company_id = public.get_user_company())
  );

DROP POLICY IF EXISTS "platform_admin_ai_scores" ON public.ai_candidate_scores;
CREATE POLICY "platform_admin_ai_scores" ON public.ai_candidate_scores
  FOR ALL USING (public.is_platform_admin());

-- talent_pools
CREATE TABLE IF NOT EXISTS public.talent_pools (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  pool_name TEXT NOT NULL,
  description TEXT,
  criteria JSONB DEFAULT '{}',
  candidate_count INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_talent_pools_company ON public.talent_pools(company_id);

ALTER TABLE public.talent_pools ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_members_talent_pools" ON public.talent_pools;
CREATE POLICY "company_members_talent_pools" ON public.talent_pools
  FOR ALL USING (company_id = public.get_user_company());

DROP POLICY IF EXISTS "platform_admin_talent_pools" ON public.talent_pools;
CREATE POLICY "platform_admin_talent_pools" ON public.talent_pools
  FOR ALL USING (public.is_platform_admin());

-- talent_pool_members
CREATE TABLE IF NOT EXISTS public.talent_pool_members (
  pool_id UUID NOT NULL REFERENCES public.talent_pools(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  added_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  PRIMARY KEY (pool_id, candidate_id)
);

CREATE INDEX IF NOT EXISTS idx_talent_pool_members_pool ON public.talent_pool_members(pool_id);
CREATE INDEX IF NOT EXISTS idx_talent_pool_members_candidate ON public.talent_pool_members(candidate_id);

ALTER TABLE public.talent_pool_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_members_talent_pool_members" ON public.talent_pool_members;
CREATE POLICY "company_members_talent_pool_members" ON public.talent_pool_members
  FOR ALL USING (
    pool_id IN (SELECT id FROM public.talent_pools WHERE company_id = public.get_user_company())
  );

DROP POLICY IF EXISTS "platform_admin_talent_pool_members" ON public.talent_pool_members;
CREATE POLICY "platform_admin_talent_pool_members" ON public.talent_pool_members
  FOR ALL USING (public.is_platform_admin());

-- Seed default pipeline stages for existing companies (idempotent)
INSERT INTO public.pipeline_stages (company_id, stage_name, stage_order, stage_color, status_key, is_active)
SELECT c.id, stage.stage_name, stage.stage_order, stage.stage_color, stage.status_key, true
FROM public.companies c
CROSS JOIN (VALUES
  ('New Matches', 0, '#94a3b8', 'ready'),
  ('Applied', 1, '#3b82f6', 'applied'),
  ('Screening', 2, '#eab308', 'screening'),
  ('Interview', 3, '#8b5cf6', 'interview'),
  ('Offer', 4, '#22c55e', 'offer'),
  ('Rejected', 5, '#ef4444', 'rejected'),
  ('Withdrawn', 6, '#64748b', 'withdrawn')
) AS stage(stage_name, stage_order, stage_color, status_key)
WHERE NOT EXISTS (
  SELECT 1 FROM public.pipeline_stages ps WHERE ps.company_id = c.id AND ps.stage_order = stage.stage_order
);

COMMENT ON TABLE public.pipeline_stages IS 'Company pipeline stages for Kanban; status_key maps to applications.status for sync';
COMMENT ON TABLE public.candidate_pipeline_history IS 'Audit trail of application moves between pipeline stages';
COMMENT ON TABLE public.ai_candidate_scores IS 'AI ranking/screening scores per candidate-job, one row per day';
COMMENT ON TABLE public.talent_pools IS 'Saved candidate pools with optional search criteria';
COMMENT ON TABLE public.talent_pool_members IS 'Many-to-many: talent pool to candidates';
