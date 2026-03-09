-- 063_team_management_performance.sql
-- Granular permissions, recruiter metrics by period, goals, team candidate notes, team tasks.

-- Ensure profiles has company_id so get_user_company() works (no FK here to avoid dependency on companies)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS company_id UUID;

-- team_permissions: granular per-user per-company permissions
CREATE TABLE IF NOT EXISTS public.team_permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  permission_key TEXT NOT NULL,
  granted BOOLEAN NOT NULL DEFAULT true,
  granted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, user_id, permission_key)
);

CREATE INDEX IF NOT EXISTS idx_team_permissions_company_user ON public.team_permissions(company_id, user_id);
ALTER TABLE public.team_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_admin_team_permissions" ON public.team_permissions;
CREATE POLICY "company_admin_team_permissions" ON public.team_permissions
  FOR ALL USING (
    company_id = public.get_user_company() AND public.is_company_admin_or_above()
  );

DROP POLICY IF EXISTS "user_read_own_permissions" ON public.team_permissions;
CREATE POLICY "user_read_own_permissions" ON public.team_permissions
  FOR SELECT USING (
    company_id = public.get_user_company() AND (user_id = auth.uid() OR public.is_company_admin_or_above())
  );

-- recruiter_period_metrics: time-bucketed metrics per recruiter per company (031 has recruiter_metrics without company_id)
CREATE TABLE IF NOT EXISTS public.recruiter_period_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recruiter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  metric_period TEXT NOT NULL CHECK (metric_period IN ('weekly', 'monthly', 'quarterly')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  candidates_contacted INT NOT NULL DEFAULT 0,
  applications_submitted INT NOT NULL DEFAULT 0,
  interviews_scheduled INT NOT NULL DEFAULT 0,
  offers_extended INT NOT NULL DEFAULT 0,
  hires_completed INT NOT NULL DEFAULT 0,
  response_rate DECIMAL,
  interview_conversion_rate DECIMAL,
  offer_acceptance_rate DECIMAL,
  avg_time_to_interview_days DECIMAL,
  quality_score DECIMAL CHECK (quality_score IS NULL OR (quality_score >= 0 AND quality_score <= 100)),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(recruiter_id, company_id, metric_period, period_start)
);

CREATE INDEX IF NOT EXISTS idx_recruiter_period_metrics_company_period ON public.recruiter_period_metrics(company_id, metric_period, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_recruiter_period_metrics_recruiter ON public.recruiter_period_metrics(recruiter_id, period_start DESC);
ALTER TABLE public.recruiter_period_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_members_recruiter_metrics" ON public.recruiter_period_metrics;
CREATE POLICY "company_members_recruiter_metrics" ON public.recruiter_period_metrics
  FOR ALL USING (company_id = public.get_user_company());

DROP POLICY IF EXISTS "platform_admin_recruiter_metrics" ON public.recruiter_period_metrics;
CREATE POLICY "platform_admin_recruiter_metrics" ON public.recruiter_period_metrics
  FOR ALL USING (public.is_platform_admin());

-- team_goals: goals per assignee or team-wide
CREATE TABLE IF NOT EXISTS public.team_goals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  assignee_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  goal_type TEXT NOT NULL,
  target_value DECIMAL NOT NULL,
  current_value DECIMAL NOT NULL DEFAULT 0,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'achieved', 'missed')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_team_goals_company_period ON public.team_goals(company_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_team_goals_assignee ON public.team_goals(assignee_id) WHERE assignee_id IS NOT NULL;
ALTER TABLE public.team_goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_members_team_goals" ON public.team_goals;
CREATE POLICY "company_members_team_goals" ON public.team_goals
  FOR ALL USING (company_id = public.get_user_company());

DROP POLICY IF EXISTS "platform_admin_team_goals" ON public.team_goals;
CREATE POLICY "platform_admin_team_goals" ON public.team_goals
  FOR ALL USING (public.is_platform_admin());

-- candidate_notes: team notes on candidates with @mentions (company-scoped; distinct from application_notes)
CREATE TABLE IF NOT EXISTS public.candidate_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  candidate_id UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  author_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  note_text TEXT NOT NULL,
  note_type TEXT CHECK (note_type IS NULL OR note_type IN ('screening', 'interview', 'general')),
  is_private BOOLEAN NOT NULL DEFAULT false,
  mentioned_users UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_candidate_notes_candidate ON public.candidate_notes(candidate_id);
CREATE INDEX IF NOT EXISTS idx_candidate_notes_company ON public.candidate_notes(company_id);
CREATE INDEX IF NOT EXISTS idx_candidate_notes_created ON public.candidate_notes(created_at DESC);
ALTER TABLE public.candidate_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_members_candidate_notes" ON public.candidate_notes;
CREATE POLICY "company_members_candidate_notes" ON public.candidate_notes
  FOR ALL USING (
    company_id = public.get_user_company()
    AND (NOT is_private OR author_id = auth.uid())
  );

DROP POLICY IF EXISTS "company_members_insert_candidate_notes" ON public.candidate_notes;
CREATE POLICY "company_members_insert_candidate_notes" ON public.candidate_notes
  FOR INSERT WITH CHECK (
    company_id = public.get_user_company()
    AND (author_id = auth.uid() OR author_id IS NULL)
  );

DROP POLICY IF EXISTS "company_members_update_own_candidate_notes" ON public.candidate_notes;
CREATE POLICY "company_members_update_own_candidate_notes" ON public.candidate_notes
  FOR UPDATE USING (company_id = public.get_user_company() AND author_id = auth.uid());

DROP POLICY IF EXISTS "platform_admin_candidate_notes" ON public.candidate_notes;
CREATE POLICY "platform_admin_candidate_notes" ON public.candidate_notes
  FOR ALL USING (public.is_platform_admin());

-- team_tasks: assignable tasks linked to candidates/jobs
CREATE TABLE IF NOT EXISTS public.team_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  assignee_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  related_candidate_id UUID REFERENCES public.candidates(id) ON DELETE SET NULL,
  related_job_id UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
  due_date TIMESTAMPTZ,
  priority TEXT CHECK (priority IS NULL OR priority IN ('low', 'medium', 'high', 'urgent')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_team_tasks_company ON public.team_tasks(company_id);
CREATE INDEX IF NOT EXISTS idx_team_tasks_assignee ON public.team_tasks(assignee_id) WHERE assignee_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_team_tasks_due ON public.team_tasks(due_date) WHERE status NOT IN ('completed', 'cancelled');
ALTER TABLE public.team_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_members_team_tasks" ON public.team_tasks;
CREATE POLICY "company_members_team_tasks" ON public.team_tasks
  FOR ALL USING (company_id = public.get_user_company());

DROP POLICY IF EXISTS "platform_admin_team_tasks" ON public.team_tasks;
CREATE POLICY "platform_admin_team_tasks" ON public.team_tasks
  FOR ALL USING (public.is_platform_admin());

COMMENT ON TABLE public.team_permissions IS 'Granular permissions per user per company';
COMMENT ON TABLE public.recruiter_period_metrics IS 'Time-bucketed recruiter performance metrics';
COMMENT ON TABLE public.team_goals IS 'Goals per assignee or team-wide';
COMMENT ON TABLE public.candidate_notes IS 'Team notes on candidates with @mentions (company-scoped)';
COMMENT ON TABLE public.team_tasks IS 'Assignable tasks linked to candidates/jobs';
