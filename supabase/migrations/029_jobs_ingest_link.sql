-- ============================================================================
-- Link jobs to ingest_jobs for auto-promotion tracking
-- ============================================================================

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS ingest_job_id UUID REFERENCES public.ingest_jobs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_ingest_job_id
  ON public.jobs (ingest_job_id)
  WHERE ingest_job_id IS NOT NULL;

COMMENT ON COLUMN public.jobs.ingest_job_id IS 'Source ingest_jobs row when job was auto-promoted from Type-B board';
