-- ============================================================================
-- Add target_job_titles to candidates
-- Candidates list the job titles they are targeting (used for title-based matching)
-- ============================================================================

ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS target_job_titles TEXT[] DEFAULT '{}';
