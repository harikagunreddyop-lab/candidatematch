-- 055_resume_management_tables.sql
-- Resume management: extended candidate_resumes + resume_ats_checks for ATS history.

-- Extend candidate_resumes (keep existing columns; add new ones)
ALTER TABLE public.candidate_resumes
  ADD COLUMN IF NOT EXISTS file_type TEXT,
  ADD COLUMN IF NOT EXISTS parsed_text TEXT,
  ADD COLUMN IF NOT EXISTS ats_score INTEGER CHECK (ats_score IS NULL OR (ats_score >= 0 AND ats_score <= 100)),
  ADD COLUMN IF NOT EXISTS ats_feedback JSONB,
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS version_name TEXT,
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

COMMENT ON COLUMN public.candidate_resumes.file_type IS 'pdf, docx, or txt';
COMMENT ON COLUMN public.candidate_resumes.parsed_text IS 'Full text extracted for ATS and search';
COMMENT ON COLUMN public.candidate_resumes.ats_score IS '0-100 ATS compatibility (general or last job-specific check)';
COMMENT ON COLUMN public.candidate_resumes.ats_feedback IS 'Detailed scoring breakdown and issues';
COMMENT ON COLUMN public.candidate_resumes.is_default IS 'Default resume for applications';
COMMENT ON COLUMN public.candidate_resumes.version_name IS 'User-defined version label';
COMMENT ON COLUMN public.candidate_resumes.tags IS 'Optional tags for filtering';

-- Ensure only one default per candidate
CREATE UNIQUE INDEX IF NOT EXISTS idx_candidate_resumes_default
  ON public.candidate_resumes (candidate_id)
  WHERE is_default = true;

-- resume_ats_checks: audit trail of ATS checks (per resume, optional job)
CREATE TABLE IF NOT EXISTS public.resume_ats_checks (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  resume_id         UUID NOT NULL REFERENCES public.candidate_resumes(id) ON DELETE CASCADE,
  job_id            UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
  ats_score         INTEGER NOT NULL CHECK (ats_score >= 0 AND ats_score <= 100),
  keyword_matches   TEXT[] DEFAULT '{}',
  keyword_misses    TEXT[] DEFAULT '{}',
  formatting_issues TEXT[] DEFAULT '{}',
  recommendations   JSONB DEFAULT '[]',
  checked_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_resume_ats_checks_resume ON public.resume_ats_checks(resume_id);
CREATE INDEX IF NOT EXISTS idx_resume_ats_checks_job ON public.resume_ats_checks(job_id);
CREATE INDEX IF NOT EXISTS idx_resume_ats_checks_checked_at ON public.resume_ats_checks(checked_at DESC);

ALTER TABLE public.resume_ats_checks ENABLE ROW LEVEL SECURITY;

-- Candidates see checks for their own resumes
CREATE POLICY "resume_ats_checks_candidate_own"
  ON public.resume_ats_checks FOR SELECT
  USING (
    resume_id IN (
      SELECT id FROM public.candidate_resumes r
      WHERE r.candidate_id IN (SELECT id FROM public.candidates WHERE user_id = auth.uid())
    )
  );

-- Admins/recruiters: allow read where they can access the candidate (via existing RLS on candidate_resumes)
CREATE POLICY "resume_ats_checks_admin"
  ON public.resume_ats_checks FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Service role / insert from API (candidate inserting their own check)
CREATE POLICY "resume_ats_checks_insert_own"
  ON public.resume_ats_checks FOR INSERT
  WITH CHECK (
    resume_id IN (
      SELECT id FROM public.candidate_resumes r
      WHERE r.candidate_id IN (SELECT id FROM public.candidates WHERE user_id = auth.uid())
    )
  );

-- Trigger: set updated_at on candidate_resumes
CREATE OR REPLACE FUNCTION public.set_candidate_resumes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_candidate_resumes_updated_at ON public.candidate_resumes;
CREATE TRIGGER trigger_candidate_resumes_updated_at
  BEFORE UPDATE ON public.candidate_resumes
  FOR EACH ROW EXECUTE FUNCTION public.set_candidate_resumes_updated_at();