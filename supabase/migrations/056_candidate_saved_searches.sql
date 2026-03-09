-- 056_candidate_saved_searches.sql
-- Saved searches with optional alert frequency for candidates.

CREATE TABLE IF NOT EXISTS public.candidate_saved_searches (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  candidate_id      UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  search_name       TEXT NOT NULL,
  search_params     JSONB NOT NULL DEFAULT '{}',
  alert_frequency   TEXT CHECK (alert_frequency IS NULL OR alert_frequency IN ('daily', 'weekly', 'instant')),
  last_notified_at  TIMESTAMPTZ,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_candidate_saved_searches_candidate
  ON public.candidate_saved_searches(candidate_id);
CREATE INDEX IF NOT EXISTS idx_candidate_saved_searches_active
  ON public.candidate_saved_searches(candidate_id, is_active) WHERE is_active = true;

COMMENT ON TABLE public.candidate_saved_searches IS 'Candidate saved search criteria with optional email/alert frequency';
COMMENT ON COLUMN public.candidate_saved_searches.search_params IS 'JSON: query, location, remote_type, salary_min, salary_max, job_type[], skills[], etc.';
COMMENT ON COLUMN public.candidate_saved_searches.alert_frequency IS 'daily, weekly, or instant (future: send notifications for new matching jobs)';

ALTER TABLE public.candidate_saved_searches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "candidate_saved_searches_own"
  ON public.candidate_saved_searches FOR ALL
  USING (
    candidate_id IN (SELECT id FROM public.candidates WHERE user_id = auth.uid())
  );

-- Optional: index for job search by common filters (if not already present)
CREATE INDEX IF NOT EXISTS idx_jobs_search_active_scraped
  ON public.jobs(is_active, scraped_at DESC) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_jobs_remote_type
  ON public.jobs(remote_type) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_jobs_salary
  ON public.jobs(salary_min, salary_max) WHERE is_active = true AND (salary_min IS NOT NULL OR salary_max IS NOT NULL);
