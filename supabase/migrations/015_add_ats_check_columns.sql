-- ============================================================================
-- Add on-demand ATS check fields (profile-only matching + ATS on demand)
-- ============================================================================

ALTER TABLE public.candidate_job_matches
  ADD COLUMN IF NOT EXISTS ats_score INTEGER CHECK (ats_score >= 0 AND ats_score <= 100),
  ADD COLUMN IF NOT EXISTS ats_reason TEXT,
  ADD COLUMN IF NOT EXISTS ats_breakdown JSONB,
  ADD COLUMN IF NOT EXISTS ats_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ats_resume_id UUID REFERENCES public.candidate_resumes(id) ON DELETE SET NULL;

