-- ============================================================================
-- 039_multitenant_rbac.sql  — Elite Multi-Tenant RBAC + Intelligence Schema
-- ADDITIVE ONLY. Safe on live production data.
-- ============================================================================

-- ── 1. COMPANIES (tenants) ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.companies (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                    TEXT NOT NULL,
  slug                    TEXT UNIQUE,
  logo_url                TEXT,
  website                 TEXT,
  industry                TEXT,
  size_range              TEXT CHECK (size_range IN ('1-10','11-50','51-200','201-1000','1000+')),
  description             TEXT,

  -- Subscription (billing owner is always a company_admin profile)
  subscription_plan       TEXT NOT NULL DEFAULT 'starter'
                          CHECK (subscription_plan IN ('starter','growth','enterprise','unlimited')),
  subscription_status     TEXT NOT NULL DEFAULT 'trialing'
                          CHECK (subscription_status IN ('trialing','active','past_due','canceled','paused')),
  subscription_period_end TIMESTAMPTZ,
  stripe_customer_id      TEXT,

  -- Hard limits enforced at API layer
  max_recruiters          INTEGER NOT NULL DEFAULT 1,
  max_active_jobs         INTEGER NOT NULL DEFAULT 5,
  max_candidates_viewed   INTEGER NOT NULL DEFAULT 100,  -- per month
  max_ai_calls_per_day    INTEGER NOT NULL DEFAULT 50,

  -- Computed intelligence (updated via triggers / crons)
  avg_time_to_hire_days   NUMERIC,
  total_hires             INTEGER NOT NULL DEFAULT 0,
  total_applications      INTEGER NOT NULL DEFAULT 0,
  total_jobs_posted       INTEGER NOT NULL DEFAULT 0,

  owner_id                UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_active               BOOLEAN NOT NULL DEFAULT TRUE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Additive: ensure core columns exist if companies was created earlier (e.g. discovery) without them
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_companies_slug    ON public.companies(slug);
CREATE INDEX IF NOT EXISTS idx_companies_owner   ON public.companies(owner_id);
CREATE INDEX IF NOT EXISTS idx_companies_active  ON public.companies(is_active);

-- ── 2. EXTEND profiles (ADDITIVE — never touches existing columns) ─────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS company_id          UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS effective_role      TEXT CHECK (effective_role IN (
    'platform_admin', 'company_admin', 'recruiter', 'candidate'
  )),
  ADD COLUMN IF NOT EXISTS permissions         JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_active_at      TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_profiles_company_id    ON public.profiles(company_id);
CREATE INDEX IF NOT EXISTS idx_profiles_effective_role ON public.profiles(effective_role);

-- ── 3. SEED effective_role FROM existing role (one-time, idempotent) ───────────

UPDATE public.profiles
SET effective_role = CASE role
  WHEN 'admin'     THEN 'platform_admin'
  WHEN 'recruiter' THEN 'recruiter'
  WHEN 'candidate' THEN 'candidate'
  ELSE 'candidate'
END
WHERE effective_role IS NULL;

-- ── 4. COMPUTED VIEW — single source of truth for role resolution ──────────────

CREATE OR REPLACE VIEW public.profile_roles AS
SELECT
  p.id,
  p.name,
  p.email,
  p.role         AS legacy_role,
  p.company_id,
  p.permissions,
  p.last_active_at,
  p.avatar_url,
  p.subscription_tier,
  p.subscription_status,
  p.is_active,
  p.created_at,
  p.updated_at,
  -- effective_role: new column takes priority; fall back to mapping legacy role
  COALESCE(
    p.effective_role,
    CASE p.role
      WHEN 'admin'     THEN 'platform_admin'
      WHEN 'recruiter' THEN 'recruiter'
      WHEN 'candidate' THEN 'candidate'
      ELSE 'candidate'
    END
  ) AS effective_role
FROM public.profiles p;

-- ── 5. DB HELPER FUNCTIONS (used in RLS — unforgeable) ────────────────────────

CREATE OR REPLACE FUNCTION public.get_effective_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE(
    effective_role,
    CASE role WHEN 'admin' THEN 'platform_admin' WHEN 'recruiter' THEN 'recruiter' ELSE 'candidate' END
  ) FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_user_company()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT company_id FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid()
    AND (role = 'admin' OR effective_role = 'platform_admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_company_admin_or_above()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid()
    AND (role = 'admin' OR effective_role IN ('platform_admin', 'company_admin'))
  );
$$;

-- ── 6. COMPANY INVITATIONS ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.company_invitations (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id   UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  invited_by   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  email        TEXT NOT NULL,
  role         TEXT NOT NULL CHECK (role IN ('company_admin', 'recruiter')),
  token        TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  accepted_at  TIMESTAMPTZ,
  accepted_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invitations_company ON public.company_invitations(company_id);
CREATE INDEX IF NOT EXISTS idx_invitations_email   ON public.company_invitations(email);
CREATE INDEX IF NOT EXISTS idx_invitations_token   ON public.company_invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_status  ON public.company_invitations(status);

-- ── 7. EXTEND jobs TABLE with company linkage ─────────────────────────────────

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS company_id        UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS posted_by         UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS visibility        TEXT NOT NULL DEFAULT 'public'
                                             CHECK (visibility IN ('public','company_only','invite_only')),
  ADD COLUMN IF NOT EXISTS applications_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS views_count        INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_jobs_company_id  ON public.jobs(company_id);
CREATE INDEX IF NOT EXISTS idx_jobs_posted_by   ON public.jobs(posted_by);

-- ── 8. CANDIDATE ACTIVITY FEED (powers intelligence + notifications) ──────────

CREATE TABLE IF NOT EXISTS public.candidate_activity (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  candidate_id UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  actor_id     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  company_id   UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  job_id       UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
  event_type   TEXT NOT NULL CHECK (event_type IN (
    'profile_viewed','application_submitted','status_changed',
    'message_sent','interview_scheduled','offer_extended',
    'hired','rejected','autofill_used','resume_downloaded',
    'ats_score_run','resume_generated','job_matched',
    'cover_letter_generated','field_corrected'
  )),
  payload      JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_candidate ON public.candidate_activity(candidate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_company   ON public.candidate_activity(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_event     ON public.candidate_activity(event_type);
CREATE INDEX IF NOT EXISTS idx_activity_job       ON public.candidate_activity(job_id);

-- ── 9. COMPANY ANALYTICS (materialized per-company KPIs) ─────────────────────

CREATE TABLE IF NOT EXISTS public.company_analytics (
  company_id            UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  total_jobs_posted     INTEGER NOT NULL DEFAULT 0,
  total_applications    INTEGER NOT NULL DEFAULT 0,
  total_interviews      INTEGER NOT NULL DEFAULT 0,
  total_offers          INTEGER NOT NULL DEFAULT 0,
  total_hires           INTEGER NOT NULL DEFAULT 0,
  avg_fit_score         NUMERIC,
  avg_time_to_hire_days NUMERIC,
  top_skills_needed     TEXT[] DEFAULT '{}',
  funnel_drop_rates     JSONB NOT NULL DEFAULT '{}',   -- { applied→interview: 0.23, interview→offer: 0.4 }
  best_performing_roles TEXT[] DEFAULT '{}',
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 10. RECRUITER PERFORMANCE (per-recruiter KPIs scoped to company) ──────────

CREATE TABLE IF NOT EXISTS public.recruiter_performance (
  recruiter_id            UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  company_id              UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  total_candidates        INTEGER NOT NULL DEFAULT 0,
  total_applications      INTEGER NOT NULL DEFAULT 0,
  interviews_secured      INTEGER NOT NULL DEFAULT 0,
  offers_received         INTEGER NOT NULL DEFAULT 0,
  hires_completed         INTEGER NOT NULL DEFAULT 0,
  avg_time_to_interview   NUMERIC,
  quality_score           NUMERIC CHECK (quality_score BETWEEN 0 AND 100),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recruiter_perf_company ON public.recruiter_performance(company_id);

-- ── 11. PLATFORM METRICS (platform_admin only — your business intelligence) ────

CREATE TABLE IF NOT EXISTS public.platform_metrics (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  metric_date               DATE NOT NULL DEFAULT CURRENT_DATE UNIQUE,
  total_companies           INTEGER NOT NULL DEFAULT 0,
  active_companies          INTEGER NOT NULL DEFAULT 0,
  total_candidates          INTEGER NOT NULL DEFAULT 0,
  total_jobs                INTEGER NOT NULL DEFAULT 0,
  applications_today        INTEGER NOT NULL DEFAULT 0,
  autofill_uses_today       INTEGER NOT NULL DEFAULT 0,
  ai_calls_today            INTEGER NOT NULL DEFAULT 0,
  new_signups_today         INTEGER NOT NULL DEFAULT 0,
  mrr_cents                 INTEGER NOT NULL DEFAULT 0,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 12. RLS POLICIES ─────────────────────────────────────────────────────────

-- COMPANIES
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_admin_all_companies" ON public.companies
  FOR ALL USING (public.is_platform_admin());

CREATE POLICY "company_members_read_own_company" ON public.companies
  FOR SELECT USING (id = public.get_user_company());

CREATE POLICY "company_admin_update_own_company" ON public.companies
  FOR UPDATE USING (id = public.get_user_company() AND public.is_company_admin_or_above());

-- COMPANY INVITATIONS
ALTER TABLE public.company_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_admin_all_invitations" ON public.company_invitations
  FOR ALL USING (public.is_platform_admin());

CREATE POLICY "company_admin_manage_invitations" ON public.company_invitations
  FOR ALL USING (company_id = public.get_user_company() AND public.is_company_admin_or_above());

CREATE POLICY "invitee_read_own_invitation" ON public.company_invitations
  FOR SELECT USING (email = (SELECT email FROM public.profiles WHERE id = auth.uid()));

-- CANDIDATE ACTIVITY
ALTER TABLE public.candidate_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_admin_all_activity" ON public.candidate_activity
  FOR ALL USING (public.is_platform_admin());

CREATE POLICY "candidate_read_own_activity" ON public.candidate_activity
  FOR SELECT USING (
    candidate_id IN (SELECT id FROM public.candidates WHERE user_id = auth.uid())
  );

CREATE POLICY "company_members_read_activity" ON public.candidate_activity
  FOR SELECT USING (
    company_id = public.get_user_company()
    AND public.get_effective_role() IN ('company_admin', 'recruiter')
  );

CREATE POLICY "company_members_insert_activity" ON public.candidate_activity
  FOR INSERT WITH CHECK (
    company_id = public.get_user_company()
    AND public.get_effective_role() IN ('company_admin', 'recruiter')
  );

-- COMPANY ANALYTICS
ALTER TABLE public.company_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_admin_all_analytics" ON public.company_analytics
  FOR ALL USING (public.is_platform_admin());

CREATE POLICY "company_members_read_own_analytics" ON public.company_analytics
  FOR SELECT USING (company_id = public.get_user_company());

-- RECRUITER PERFORMANCE
ALTER TABLE public.recruiter_performance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_admin_all_perf" ON public.recruiter_performance FOR ALL USING (public.is_platform_admin());
CREATE POLICY "company_admin_read_perf" ON public.recruiter_performance FOR SELECT
  USING (company_id = public.get_user_company() AND public.is_company_admin_or_above());
CREATE POLICY "recruiter_read_own_perf" ON public.recruiter_performance FOR SELECT
  USING (recruiter_id = auth.uid());

-- PLATFORM METRICS (platform_admin only)
ALTER TABLE public.platform_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "platform_admin_only_metrics" ON public.platform_metrics FOR ALL USING (public.is_platform_admin());

-- ── 13. UPDATED_AT TRIGGERS ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_companies_updated_at ON public.companies;
CREATE TRIGGER trg_companies_updated_at BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
