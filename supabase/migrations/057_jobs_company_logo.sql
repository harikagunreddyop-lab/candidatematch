-- 057_jobs_company_logo.sql
-- Add optional company logo URL to jobs for display on job cards.

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS company_logo_url TEXT;

COMMENT ON COLUMN public.jobs.company_logo_url IS 'Optional URL to company logo image for job cards and listings';
