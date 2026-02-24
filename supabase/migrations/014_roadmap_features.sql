-- Tier 1–4 roadmap: job freshness, hide job, cron history, feature flags,
-- application timeline, saved searches, assignment reason, ATS-by-company.

-- Jobs: freshness (last_seen_at for scrape/refresh; stale = not seen in 30d)
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
COMMENT ON COLUMN public.jobs.last_seen_at IS 'Last time this job was seen (scrape or manual refresh). Used for stale flag.';

-- Candidate "not interested" / hide job
CREATE TABLE IF NOT EXISTS public.candidate_hidden_jobs (
  candidate_id UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  job_id      UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  hidden_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason      TEXT,
  PRIMARY KEY (candidate_id, job_id)
);
CREATE INDEX IF NOT EXISTS idx_candidate_hidden_jobs_candidate ON public.candidate_hidden_jobs(candidate_id);

-- Cron run history (admin visibility)
CREATE TABLE IF NOT EXISTS public.cron_run_history (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  started_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at               TIMESTAMPTZ,
  status                 TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'ok', 'failed')),
  mode                   TEXT,
  candidates_processed   INTEGER DEFAULT 0,
  total_matches_upserted INTEGER DEFAULT 0,
  error_message          TEXT
);
CREATE INDEX IF NOT EXISTS idx_cron_run_history_started ON public.cron_run_history(started_at DESC);

-- Feature flags (role-scoped: null = all roles)
CREATE TABLE IF NOT EXISTS public.feature_flags (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key        TEXT NOT NULL UNIQUE,
  value      JSONB NOT NULL DEFAULT 'true',
  role       TEXT CHECK (role IN ('admin', 'recruiter', 'candidate')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO public.feature_flags (key, value, role) VALUES
  ('candidate_see_ats_fix_report', 'true', 'candidate'),
  ('candidate_see_why_score', 'true', 'candidate'),
  ('recruiter_bulk_apply', 'true', 'recruiter')
ON CONFLICT (key) DO NOTHING;

-- Application status timeline (for "Application notes timeline")
CREATE TABLE IF NOT EXISTS public.application_status_history (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  from_status    TEXT,
  to_status      TEXT NOT NULL,
  notes          TEXT,
  actor_id       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_app_status_history_app ON public.application_status_history(application_id);

-- Recruiter saved searches + optional digest
CREATE TABLE IF NOT EXISTS public.saved_searches (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recruiter_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  filters       JSONB NOT NULL DEFAULT '{}',
  notify_digest BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_saved_searches_recruiter ON public.saved_searches(recruiter_id);

-- Jobs: ATS-by-company (inferred or set per job)
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS ats_provider TEXT;
COMMENT ON COLUMN public.jobs.ats_provider IS 'Inferred or set ATS: workday, greenhouse, lever, taleo, icims, successfactors, smartrecruiters, workable, bamboohr, manatal, other';
