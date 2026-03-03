-- ============================================================================
-- 023_human_review_requests.sql
-- NYC LL144 / EU AI Act: Candidate can request human review when apply blocked.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.human_review_requests (
  id              UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ       NOT NULL DEFAULT NOW(),

  candidate_id    UUID              NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  job_id          UUID              NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,

  -- Context at time of request
  ats_score       INTEGER           NULL,
  gate_reason     TEXT              NULL,
  missing_keywords TEXT[]           DEFAULT '{}',

  -- Status
  status          TEXT              NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_at     TIMESTAMPTZ       NULL,
  reviewer_id     UUID              NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewer_notes  TEXT              NULL,

  UNIQUE (candidate_id, job_id)
);

COMMENT ON TABLE public.human_review_requests
  IS 'Candidate requests for human review when automated apply gate blocks. NYC AEDT / EU AI Act compliance.';

CREATE INDEX IF NOT EXISTS idx_human_review_requests_status
  ON public.human_review_requests (status)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_human_review_requests_candidate
  ON public.human_review_requests (candidate_id);

CREATE INDEX IF NOT EXISTS idx_human_review_requests_job
  ON public.human_review_requests (job_id);
