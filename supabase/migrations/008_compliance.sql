-- ============================================================================
-- 008 — Compliance & Data Governance
-- ============================================================================

-- Consent records table
CREATE TABLE IF NOT EXISTS public.consent_records (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  consent_type   TEXT NOT NULL CHECK (consent_type IN ('privacy_policy', 'data_processing', 'marketing_emails', 'third_party_sharing', 'cookie_tracking')),
  granted        BOOLEAN NOT NULL DEFAULT FALSE,
  granted_at     TIMESTAMPTZ,
  revoked_at     TIMESTAMPTZ,
  ip_address     TEXT,
  user_agent     TEXT,
  version        TEXT NOT NULL DEFAULT '1.0',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_consent_profile ON public.consent_records(profile_id);
CREATE INDEX IF NOT EXISTS idx_consent_type ON public.consent_records(consent_type);

-- Data deletion requests table
CREATE TABLE IF NOT EXISTS public.data_deletion_requests (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  requested_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason         TEXT,
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'processing', 'completed', 'rejected')),
  reviewed_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at    TIMESTAMPTZ,
  review_notes   TEXT,
  completed_at   TIMESTAMPTZ,
  data_exported  BOOLEAN DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_deletion_profile ON public.data_deletion_requests(profile_id);
CREATE INDEX IF NOT EXISTS idx_deletion_status ON public.data_deletion_requests(status);

-- Data retention policies table
CREATE TABLE IF NOT EXISTS public.data_retention_policies (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  data_category  TEXT NOT NULL UNIQUE CHECK (data_category IN ('candidate_profiles', 'applications', 'messages', 'resumes', 'matches', 'audit_logs', 'scraped_jobs')),
  retention_days INTEGER NOT NULL DEFAULT 365,
  auto_delete    BOOLEAN NOT NULL DEFAULT FALSE,
  description    TEXT,
  updated_by     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default retention policies
INSERT INTO public.data_retention_policies (data_category, retention_days, auto_delete, description) VALUES
  ('candidate_profiles', 730, false, 'Candidate profile data including personal information'),
  ('applications', 365, false, 'Job application records and status history'),
  ('messages', 180, false, 'Chat messages between users'),
  ('resumes', 365, false, 'Uploaded and generated resume files'),
  ('matches', 180, true, 'AI-generated job match scores and breakdowns'),
  ('audit_logs', 1095, false, 'System audit trail for compliance'),
  ('scraped_jobs', 90, true, 'Scraped job listings from external sources')
ON CONFLICT (data_category) DO NOTHING;

-- Add consent fields to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS privacy_policy_accepted_at TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS data_processing_consent BOOLEAN DEFAULT FALSE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS marketing_consent BOOLEAN DEFAULT FALSE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ;

-- RLS policies
ALTER TABLE public.consent_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_deletion_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_retention_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own consent" ON public.consent_records
  FOR SELECT USING (profile_id = auth.uid());
CREATE POLICY "Users can insert own consent" ON public.consent_records
  FOR INSERT WITH CHECK (profile_id = auth.uid());
CREATE POLICY "Admins full access consent" ON public.consent_records
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Users can view own deletion requests" ON public.data_deletion_requests
  FOR SELECT USING (profile_id = auth.uid());
CREATE POLICY "Users can create own deletion requests" ON public.data_deletion_requests
  FOR INSERT WITH CHECK (profile_id = auth.uid());
CREATE POLICY "Admins full access deletion" ON public.data_deletion_requests
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins manage retention policies" ON public.data_retention_policies
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Anyone can view retention policies" ON public.data_retention_policies
  FOR SELECT USING (true);
