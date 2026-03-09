-- 060_company_hiring_analytics.sql
-- Company hiring metrics (daily snapshot), hiring costs, and aggregation for analytics dashboard.

-- company_hiring_metrics: daily snapshot per company for funnel, time-to-hire, cost, quality
CREATE TABLE IF NOT EXISTS public.company_hiring_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  metric_date DATE NOT NULL,
  total_active_jobs INT DEFAULT 0,
  total_applications INT DEFAULT 0,
  applications_in_screening INT DEFAULT 0,
  applications_in_interview INT DEFAULT 0,
  offers_made INT DEFAULT 0,
  hires_completed INT DEFAULT 0,
  avg_time_to_hire_days DECIMAL,
  avg_cost_per_hire_cents BIGINT,
  avg_quality_of_hire_score DECIMAL,
  funnel_drop_rates JSONB DEFAULT '{}',
  top_performing_sources JSONB DEFAULT '[]',
  diversity_stats JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, metric_date)
);

CREATE INDEX IF NOT EXISTS idx_company_hiring_metrics_company_date
  ON public.company_hiring_metrics(company_id, metric_date DESC);

ALTER TABLE public.company_hiring_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_members_read_own_hiring_metrics" ON public.company_hiring_metrics
  FOR SELECT USING (company_id = public.get_user_company());

CREATE POLICY "platform_admin_all_hiring_metrics" ON public.company_hiring_metrics
  FOR ALL USING (public.is_platform_admin());

-- hiring_costs: track cost per hire (job boards, recruiter fees, advertising, etc.)
CREATE TABLE IF NOT EXISTS public.hiring_costs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  job_id UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
  hire_id UUID,
  cost_type TEXT NOT NULL CHECK (cost_type IN ('job_board', 'recruiter_fee', 'advertising', 'software', 'other')),
  amount_cents BIGINT NOT NULL CHECK (amount_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  description TEXT,
  incurred_at DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hiring_costs_company_incurred
  ON public.hiring_costs(company_id, incurred_at DESC);

ALTER TABLE public.hiring_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_admin_manage_own_costs" ON public.hiring_costs
  FOR ALL USING (company_id = public.get_user_company() AND public.is_company_admin_or_above());

CREATE POLICY "company_members_read_own_costs" ON public.hiring_costs
  FOR SELECT USING (company_id = public.get_user_company());

CREATE POLICY "platform_admin_all_costs" ON public.hiring_costs
  FOR ALL USING (public.is_platform_admin());

-- hire_quality_evaluations: post-hire 90-day evaluation (manager rating, performance, retention)
CREATE TABLE IF NOT EXISTS public.hire_quality_evaluations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  hire_date DATE NOT NULL,
  manager_rating INT CHECK (manager_rating >= 1 AND manager_rating <= 10),
  performance_rating INT CHECK (performance_rating >= 1 AND performance_rating <= 10),
  culture_fit_rating INT CHECK (culture_fit_rating >= 1 AND culture_fit_rating <= 10),
  retention_90_days BOOLEAN,
  composite_score DECIMAL CHECK (composite_score >= 0 AND composite_score <= 100),
  notes TEXT,
  evaluated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(application_id)
);

CREATE INDEX IF NOT EXISTS idx_hire_quality_company ON public.hire_quality_evaluations(company_id);

ALTER TABLE public.hire_quality_evaluations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_admin_manage_quality" ON public.hire_quality_evaluations
  FOR ALL USING (company_id = public.get_user_company() AND public.is_company_admin_or_above());

CREATE POLICY "company_members_read_quality" ON public.hire_quality_evaluations
  FOR SELECT USING (company_id = public.get_user_company());

-- Aggregation: upsert daily metrics for a company (applications by status; hires = offer + accepted)
CREATE OR REPLACE FUNCTION public.update_company_daily_metrics(p_company_id UUID, p_date DATE)
RETURNS void AS $$
DECLARE
  v_active_jobs INT;
  v_total_apps INT;
  v_screening INT;
  v_interview INT;
  v_offers INT;
  v_hires INT;
BEGIN
  SELECT COUNT(*) INTO v_active_jobs
  FROM public.jobs
  WHERE company_id = p_company_id AND is_active = true;

  SELECT COUNT(*) INTO v_total_apps
  FROM public.applications a
  JOIN public.jobs j ON j.id = a.job_id
  WHERE j.company_id = p_company_id AND (a.created_at AT TIME ZONE 'UTC')::date <= p_date;

  SELECT COUNT(*) INTO v_screening
  FROM public.applications a
  JOIN public.jobs j ON j.id = a.job_id
  WHERE j.company_id = p_company_id AND a.status = 'screening';

  SELECT COUNT(*) INTO v_interview
  FROM public.applications a
  JOIN public.jobs j ON j.id = a.job_id
  WHERE j.company_id = p_company_id AND a.status = 'interview';

  SELECT COUNT(*) INTO v_offers
  FROM public.applications a
  JOIN public.jobs j ON j.id = a.job_id
  WHERE j.company_id = p_company_id AND a.status = 'offer';

  -- Hires: offer with accepted = true (offer_details->>'accepted' = 'true')
  SELECT COUNT(*) INTO v_hires
  FROM public.applications a
  JOIN public.jobs j ON j.id = a.job_id
  WHERE j.company_id = p_company_id
    AND a.status = 'offer'
    AND (a.offer_details->>'accepted')::text = 'true';

  INSERT INTO public.company_hiring_metrics (
    company_id, metric_date,
    total_active_jobs, total_applications,
    applications_in_screening, applications_in_interview,
    offers_made, hires_completed
  )
  VALUES (
    p_company_id, p_date,
    v_active_jobs, v_total_apps,
    v_screening, v_interview,
    v_offers, v_hires
  )
  ON CONFLICT (company_id, metric_date)
  DO UPDATE SET
    total_active_jobs = EXCLUDED.total_active_jobs,
    total_applications = EXCLUDED.total_applications,
    applications_in_screening = EXCLUDED.applications_in_screening,
    applications_in_interview = EXCLUDED.applications_in_interview,
    offers_made = EXCLUDED.offers_made,
    hires_completed = EXCLUDED.hires_completed;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.update_company_daily_metrics IS 'Upsert daily hiring metrics for a company (used by cron or on-demand).';

-- Optional: department on jobs for analytics breakdown
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS department TEXT;
