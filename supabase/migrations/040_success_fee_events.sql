-- ============================================================================
-- 040_success_fee_events.sql — Success fee tracking and contact-view agreement
-- ADDITIVE ONLY.
-- ============================================================================

-- Success fee per hire (company pays when they hire a candidate they viewed)
CREATE TABLE IF NOT EXISTS public.success_fee_events (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  candidate_id      UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  job_id            UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
  hired_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  amount_cents      INTEGER NOT NULL,
  currency          TEXT NOT NULL DEFAULT 'usd',
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'invoiced', 'paid')),
  agreement_accepted_at TIMESTAMPTZ,
  stripe_invoice_id TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_success_fee_events_company_status ON public.success_fee_events(company_id, status);
CREATE INDEX IF NOT EXISTS idx_success_fee_events_candidate ON public.success_fee_events(candidate_id);

-- Agreement: company accepted success-fee terms when viewing candidate contact info
CREATE TABLE IF NOT EXISTS public.success_fee_agreements (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id   UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  accepted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, candidate_id)
);

CREATE INDEX IF NOT EXISTS idx_success_fee_agreements_company ON public.success_fee_agreements(company_id);
CREATE INDEX IF NOT EXISTS idx_success_fee_agreements_candidate ON public.success_fee_agreements(candidate_id);

-- RLS
ALTER TABLE public.success_fee_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.success_fee_agreements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_admin_all_success_fee_events" ON public.success_fee_events
  FOR ALL USING (public.is_platform_admin());

CREATE POLICY "company_members_read_success_fee_events" ON public.success_fee_events
  FOR SELECT USING (company_id = public.get_user_company());
CREATE POLICY "company_admin_insert_success_fee_events" ON public.success_fee_events
  FOR INSERT WITH CHECK (
    company_id = public.get_user_company()
    AND public.is_company_admin_or_above()
  );
CREATE POLICY "company_admin_update_success_fee_events" ON public.success_fee_events
  FOR UPDATE USING (company_id = public.get_user_company() AND public.is_company_admin_or_above());

CREATE POLICY "platform_admin_all_agreements" ON public.success_fee_agreements
  FOR ALL USING (public.is_platform_admin());
CREATE POLICY "company_members_read_agreements" ON public.success_fee_agreements
  FOR SELECT USING (company_id = public.get_user_company());
CREATE POLICY "company_members_insert_agreements" ON public.success_fee_agreements
  FOR INSERT WITH CHECK (
    company_id = public.get_user_company()
    AND public.get_effective_role() IN ('company_admin', 'recruiter')
  );

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_success_fee_events_updated_at ON public.success_fee_events;
CREATE TRIGGER trg_success_fee_events_updated_at BEFORE UPDATE ON public.success_fee_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Monthly usage per company (for max_candidates_viewed enforcement)
CREATE TABLE IF NOT EXISTS public.company_usage (
  company_id        UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  usage_month       DATE NOT NULL,
  candidates_viewed INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (company_id, usage_month)
);

CREATE INDEX IF NOT EXISTS idx_company_usage_month ON public.company_usage(usage_month);

ALTER TABLE public.company_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "platform_admin_all_company_usage" ON public.company_usage
  FOR ALL USING (public.is_platform_admin());
CREATE POLICY "company_members_read_company_usage" ON public.company_usage
  FOR SELECT USING (company_id = public.get_user_company());
CREATE POLICY "company_members_update_company_usage" ON public.company_usage
  FOR ALL USING (company_id = public.get_user_company());
