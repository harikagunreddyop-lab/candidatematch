-- ============================================================================
-- Type-B (public job board) job ingestion engine
-- Tables: ingest_connectors, ingest_jobs
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ingest_connectors (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider          TEXT NOT NULL CHECK (provider IN ('greenhouse', 'lever', 'ashby')),
  source_org        TEXT NOT NULL,
  is_enabled        BOOLEAN NOT NULL DEFAULT true,
  sync_interval_min INTEGER NOT NULL DEFAULT 60,
  last_run_at       TIMESTAMPTZ,
  last_success_at   TIMESTAMPTZ,
  last_error        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ingest_jobs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider         TEXT NOT NULL,
  source_org       TEXT NOT NULL,
  source_job_id    TEXT NOT NULL,
  title            TEXT NOT NULL,
  location_raw     TEXT,
  department       TEXT,
  job_url          TEXT,
  apply_url        TEXT NOT NULL,
  description_text TEXT NOT NULL,
  description_html TEXT,
  posted_at        TIMESTAMPTZ,
  updated_at       TIMESTAMPTZ,
  status           TEXT NOT NULL CHECK (status IN ('open', 'closed')),
  content_hash     TEXT NOT NULL,
  raw_payload      JSONB NOT NULL,
  first_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, source_org, source_job_id)
);

CREATE INDEX IF NOT EXISTS idx_ingest_jobs_provider_org_status
  ON public.ingest_jobs (provider, source_org, status);

CREATE INDEX IF NOT EXISTS idx_ingest_jobs_last_seen_at
  ON public.ingest_jobs (last_seen_at);

CREATE INDEX IF NOT EXISTS idx_ingest_connectors_enabled_last_run
  ON public.ingest_connectors (is_enabled, last_run_at)
  WHERE is_enabled = true;

COMMENT ON TABLE public.ingest_connectors IS 'Type-B job board connectors (Greenhouse, Lever, Ashby)';
COMMENT ON TABLE public.ingest_jobs IS 'Canonical job postings from public job board APIs';
