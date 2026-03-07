-- ============================================================================
-- 041_phase1_enterprise_additions.sql — Phase 1 Option B (additive)
-- Enterprise RBAC: companies extras, activity_log, jobs RLS. No users table.
-- ============================================================================

-- ── 1. COMPANIES (additive columns) ─────────────────────────────────────────

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS trial_ends_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS settings         JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS created_by       UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.companies.trial_ends_at IS 'When trial ends; used when subscription_status is trialing';
COMMENT ON COLUMN public.companies.settings IS 'Company-specific settings JSON';
COMMENT ON COLUMN public.companies.created_by IS 'Profile who created the company record';

-- ── 2. ACTIVITY_LOG (enterprise audit-style log) ─────────────────────────────

CREATE TABLE IF NOT EXISTS public.activity_log (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id    UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,

  action        TEXT NOT NULL,
  resource_type TEXT,
  resource_id   UUID,

  metadata      JSONB NOT NULL DEFAULT '{}',
  ip_address    INET,
  user_agent    TEXT,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_log_company_created
  ON public.activity_log(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_user_created
  ON public.activity_log(user_id, created_at DESC)
  WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_activity_log_action
  ON public.activity_log(action);
CREATE INDEX IF NOT EXISTS idx_activity_log_resource
  ON public.activity_log(resource_type, resource_id)
  WHERE resource_type IS NOT NULL AND resource_id IS NOT NULL;

COMMENT ON TABLE public.activity_log IS 'Enterprise activity log (job_created, candidate_viewed, etc.)';

-- RLS for activity_log
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_admin_all_activity_log" ON public.activity_log
  FOR ALL USING (public.is_platform_admin());

CREATE POLICY "company_members_read_activity_log" ON public.activity_log
  FOR SELECT USING (
    company_id = public.get_user_company()
    AND public.get_effective_role() IN ('company_admin', 'recruiter')
  );

CREATE POLICY "company_members_insert_activity_log" ON public.activity_log
  FOR INSERT WITH CHECK (
    company_id = public.get_user_company()
    AND public.get_effective_role() IN ('company_admin', 'recruiter')
  );

-- ── 3. JOBS (optional created_by; keep posted_by as source of truth) ─────────

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.jobs.created_by IS 'Alias/sync with posted_by for compatibility; set on insert if not provided';

-- ── 4. JOBS RLS (company-scoped write; keep existing read) ───────────────────

-- Drop legacy broad write policy so we can replace with company-scoped
DROP POLICY IF EXISTS "jobs_admin_write" ON public.jobs;

-- Platform admins: full access
CREATE POLICY "jobs_platform_admin_all" ON public.jobs
  FOR ALL USING (public.is_platform_admin());

-- Company admins and recruiters: SELECT their company's jobs
CREATE POLICY "jobs_company_members_select" ON public.jobs
  FOR SELECT USING (
    public.get_user_company() IS NOT NULL
    AND company_id = public.get_user_company()
    AND public.get_effective_role() IN ('company_admin', 'recruiter')
  );

-- Company admins and recruiters: INSERT jobs for their company
CREATE POLICY "jobs_company_members_insert" ON public.jobs
  FOR INSERT WITH CHECK (
    public.get_user_company() IS NOT NULL
    AND company_id = public.get_user_company()
    AND public.get_effective_role() IN ('company_admin', 'recruiter')
  );

-- Company admins: UPDATE/DELETE any company job; recruiters: own jobs (posted_by)
CREATE POLICY "jobs_company_admin_update_delete" ON public.jobs
  FOR ALL USING (
    company_id = public.get_user_company()
    AND public.get_effective_role() = 'company_admin'
  );

CREATE POLICY "jobs_recruiter_update_delete_own" ON public.jobs
  FOR UPDATE USING (
    company_id = public.get_user_company()
    AND public.get_effective_role() = 'recruiter'
    AND posted_by = auth.uid()
  );

CREATE POLICY "jobs_recruiter_delete_own" ON public.jobs
  FOR DELETE USING (
    company_id = public.get_user_company()
    AND public.get_effective_role() = 'recruiter'
    AND posted_by = auth.uid()
  );

-- Note: jobs_select_all (SELECT USING TRUE) remains from 001 — all rows readable.
-- Candidates and public job board rely on it; company-scoped read above is additive.

-- ── 5. HELPER: can_access_company (for future API use) ─────────────────────────

CREATE OR REPLACE FUNCTION public.can_access_company(target_company_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT public.is_platform_admin()
  OR public.get_user_company() = target_company_id;
$$;
