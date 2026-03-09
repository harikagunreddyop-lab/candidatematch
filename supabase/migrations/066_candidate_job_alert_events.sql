-- 066_candidate_job_alert_events.sql
-- Durable candidate job-alert events for dedupe + delivery tracking.

CREATE TABLE IF NOT EXISTS public.candidate_job_alert_events (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  saved_search_id  UUID NOT NULL REFERENCES public.candidate_saved_searches(id) ON DELETE CASCADE,
  candidate_id     UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  job_id           UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  channel          TEXT NOT NULL CHECK (channel IN ('email', 'in_app')),
  delivery_status  TEXT NOT NULL DEFAULT 'pending' CHECK (delivery_status IN ('pending', 'sent', 'failed', 'skipped')),
  delivered_at     TIMESTAMPTZ,
  read_at          TIMESTAMPTZ,
  error_message    TEXT,
  payload          JSONB NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (saved_search_id, job_id, channel)
);

CREATE INDEX IF NOT EXISTS idx_alert_events_candidate_created
  ON public.candidate_job_alert_events(candidate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_events_candidate_unread
  ON public.candidate_job_alert_events(candidate_id, channel, read_at)
  WHERE channel = 'in_app';
CREATE INDEX IF NOT EXISTS idx_alert_events_search_channel
  ON public.candidate_job_alert_events(saved_search_id, channel, created_at DESC);

COMMENT ON TABLE public.candidate_job_alert_events IS 'Per-search per-job alert delivery events for email and in-app channels';
COMMENT ON COLUMN public.candidate_job_alert_events.payload IS 'Snapshot of job/search metadata used when alert event was created';

ALTER TABLE public.candidate_job_alert_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "candidate_job_alert_events_own_read"
  ON public.candidate_job_alert_events FOR SELECT
  USING (
    candidate_id IN (SELECT id FROM public.candidates WHERE user_id = auth.uid())
  );

CREATE POLICY "candidate_job_alert_events_own_update"
  ON public.candidate_job_alert_events FOR UPDATE
  USING (
    candidate_id IN (SELECT id FROM public.candidates WHERE user_id = auth.uid())
  );

DROP TRIGGER IF EXISTS set_updated_at_candidate_job_alert_events ON public.candidate_job_alert_events;
CREATE TRIGGER set_updated_at_candidate_job_alert_events
  BEFORE UPDATE ON public.candidate_job_alert_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
