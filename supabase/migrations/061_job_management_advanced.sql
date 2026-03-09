-- 061_job_management_advanced.sql
-- Job templates, external postings, performance metrics, and job optimization columns.

-- job_templates: reusable job description templates by role/industry
CREATE TABLE IF NOT EXISTS public.job_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  template_name TEXT NOT NULL,
  job_title TEXT NOT NULL,
  job_description TEXT NOT NULL,
  requirements JSONB DEFAULT '[]',
  benefits JSONB DEFAULT '[]',
  salary_range JSONB,
  is_public BOOLEAN NOT NULL DEFAULT false,
  usage_count INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_templates_company ON public.job_templates(company_id);
CREATE INDEX IF NOT EXISTS idx_job_templates_public ON public.job_templates(is_public) WHERE is_public = true;

ALTER TABLE public.job_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_members_manage_templates" ON public.job_templates
  FOR ALL USING (company_id = public.get_user_company());

CREATE POLICY "platform_admin_all_templates" ON public.job_templates
  FOR ALL USING (public.is_platform_admin());

-- job_postings_external: track where job is posted (LinkedIn, Indeed, etc.)
CREATE TABLE IF NOT EXISTS public.job_postings_external (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  board_name TEXT NOT NULL,
  external_job_id TEXT,
  posted_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'closed')),
  views INT NOT NULL DEFAULT 0,
  applications INT NOT NULL DEFAULT 0,
  cost_cents BIGINT,
  posted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(job_id, board_name)
);

CREATE INDEX IF NOT EXISTS idx_job_postings_external_job ON public.job_postings_external(job_id);

ALTER TABLE public.job_postings_external ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_members_via_job" ON public.job_postings_external
  FOR ALL USING (
    job_id IN (SELECT id FROM public.jobs WHERE company_id = public.get_user_company())
  );

CREATE POLICY "platform_admin_all_external" ON public.job_postings_external
  FOR ALL USING (public.is_platform_admin());

-- job_performance_metrics: daily snapshot per job for analytics
CREATE TABLE IF NOT EXISTS public.job_performance_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  metric_date DATE NOT NULL,
  total_views INT NOT NULL DEFAULT 0,
  total_applications INT NOT NULL DEFAULT 0,
  qualified_applications INT NOT NULL DEFAULT 0,
  interviews_scheduled INT NOT NULL DEFAULT 0,
  conversion_rate DECIMAL,
  quality_score DECIMAL,
  time_to_first_application_hours INT,
  avg_candidate_match_score DECIMAL,
  top_application_sources JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(job_id, metric_date)
);

CREATE INDEX IF NOT EXISTS idx_job_performance_job_date ON public.job_performance_metrics(job_id, metric_date DESC);

ALTER TABLE public.job_performance_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_members_read_performance" ON public.job_performance_metrics
  FOR SELECT USING (
    job_id IN (SELECT id FROM public.jobs WHERE company_id = public.get_user_company())
  );

CREATE POLICY "platform_admin_all_performance" ON public.job_performance_metrics
  FOR ALL USING (public.is_platform_admin());

-- scheduled_job_postings: for job posting scheduler
CREATE TABLE IF NOT EXISTS public.scheduled_job_postings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  platforms TEXT[] NOT NULL DEFAULT '{}',
  scheduled_for TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
  posted_at TIMESTAMPTZ,
  auto_repost BOOLEAN NOT NULL DEFAULT false,
  repost_frequency_days INT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_job_postings_for ON public.scheduled_job_postings(scheduled_for) WHERE status = 'pending';

ALTER TABLE public.scheduled_job_postings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_members_scheduled" ON public.scheduled_job_postings
  FOR ALL USING (company_id = public.get_user_company());

-- Extend jobs table for optimization and assignment
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS jd_optimization_score INT,
  ADD COLUMN IF NOT EXISTS salary_competitiveness TEXT CHECK (salary_competitiveness IS NULL OR salary_competitiveness IN ('below_market', 'at_market', 'above_market')),
  ADD COLUMN IF NOT EXISTS predicted_time_to_fill_days INT,
  ADD COLUMN IF NOT EXISTS budget_allocated_cents BIGINT,
  ADD COLUMN IF NOT EXISTS assigned_recruiter_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_assigned_recruiter ON public.jobs(assigned_recruiter_id) WHERE assigned_recruiter_id IS NOT NULL;

COMMENT ON COLUMN public.jobs.jd_optimization_score IS '0-100 AI-calculated readability/ATS score';
COMMENT ON COLUMN public.jobs.salary_competitiveness IS 'Relative to market from salary benchmark';
COMMENT ON COLUMN public.jobs.predicted_time_to_fill_days IS 'AI or historical prediction';
COMMENT ON COLUMN public.jobs.budget_allocated_cents IS 'Budget for this role posting/spend';
COMMENT ON COLUMN public.jobs.assigned_recruiter_id IS 'Recruiter responsible for this job';
