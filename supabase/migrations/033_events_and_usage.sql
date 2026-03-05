-- Migration 033: Product Analytics Events + Usage Limits + Performance Indexes
-- All changes idempotent (IF NOT EXISTS).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Product analytics events table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.events (
  id          BIGSERIAL   PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_type  TEXT        NOT NULL,
  metadata    JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.events
  IS 'Product analytics events. Append-only. user_id is always the authenticated user.';

CREATE INDEX IF NOT EXISTS idx_events_user_type_created
  ON public.events (user_id, event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_events_type_created
  ON public.events (event_type, created_at DESC);

-- RLS
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- Idempotent policy creation (CREATE POLICY does not support IF NOT EXISTS in PG)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'events' AND policyname = 'events_insert_own'
  ) THEN
    CREATE POLICY "events_insert_own" ON public.events
      FOR INSERT WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'events' AND policyname = 'events_admin_read'
  ) THEN
    CREATE POLICY "events_admin_read" ON public.events
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'recruiter'))
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'events' AND policyname = 'events_service_read'
  ) THEN
    CREATE POLICY "events_service_read" ON public.events
      FOR SELECT USING (auth.role() = 'service_role');
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. cron_run_history: add partial checkpoint columns
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.cron_run_history
  ADD COLUMN IF NOT EXISTS partial_at         TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS candidates_skipped INTEGER     NULL DEFAULT 0;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. scoring_runs: compound index for ATS cache lookup
--    Cache key: (candidate_id, job_id, model_version, inputs_hash)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_scoring_runs_cache_lookup
  ON public.scoring_runs (candidate_id, job_id, model_version, inputs_hash);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. jobs: compound indexes for list queries
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_jobs_active_scraped
  ON public.jobs (scraped_at DESC)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_jobs_title_tsvector
  ON public.jobs USING GIN (to_tsvector('english', title));

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. applications: compound index for candidate dashboard list
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_applications_candidate_status
  ON public.applications (candidate_id, status);

CREATE INDEX IF NOT EXISTS idx_applications_candidate_created
  ON public.applications (candidate_id, created_at DESC);
