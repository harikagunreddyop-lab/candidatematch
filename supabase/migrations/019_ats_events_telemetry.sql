-- ============================================================================
-- 019_ats_events_telemetry.sql
--
-- Creates public.ats_events — the append-only telemetry log for ALL scoring
-- and outcome events.  This table is the source of truth for:
--   • Calibration: score → P(interview) mapping
--   • KPIs: interview rate, pipeline velocity
--   • A/B testing: compare engine versions head-to-head
--   • Governance: reproducible audit trail
--
-- Design notes:
--   • id is BIGSERIAL (not UUID) — sequential IDs are faster for time-series
--     inserts and cheaper to index than random UUIDs.
--   • match_id is TEXT, not UUID, so it works even if the upstream table's PK
--     type ever changes. Callers cast their UUID toString().
--   • payload JSONB holds event-specific fields — keeps the schema stable while
--     allowing each event_type to carry its own data shape.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ats_events (
  id              BIGSERIAL         PRIMARY KEY,
  created_at      TIMESTAMPTZ       NOT NULL DEFAULT NOW(),

  -- Multi-tenancy (nullable — single-tenant deployments leave NULL)
  tenant_id       UUID              NULL,

  -- Cross-references (all nullable so partial/system events can be logged)
  candidate_id    UUID              NULL REFERENCES public.candidates(id)  ON DELETE SET NULL,
  job_id          UUID              NULL REFERENCES public.jobs(id)         ON DELETE SET NULL,
  -- match_id stored as TEXT: candidate_job_matches.id is UUID; caller does ::text cast.
  match_id        TEXT              NULL,
  application_id  UUID              NULL REFERENCES public.applications(id) ON DELETE SET NULL,

  -- Who triggered this event
  actor_user_id   UUID              NULL REFERENCES public.profiles(id)    ON DELETE SET NULL,
  event_source    TEXT              NOT NULL DEFAULT 'system',

  -- Event classification
  -- Canonical event_type values (document here; not enforced as enum so migrations stay easy):
  --   ats_score_computed           — after every scoring run
  --   ats_gate_passed              — candidate score passed the apply gate
  --   ats_gate_blocked             — candidate score blocked by gate
  --   ats_shadow_delta             — shadow engine produced a score delta > threshold
  --   outcome_interview            — application moved to 'interview' status
  --   outcome_offer                — application moved to 'offer' status
  --   outcome_hired                — application moved to 'hired' status
  --   outcome_rejected             — application moved to 'rejected' status
  --   candidate_years_discrepancy  — profile years vs. computed years differ by >= 2.0
  --   outreach_sent                — outreach message dispatched
  --   outreach_replied             — reply received from outreach target
  --   governance_flag              — fairness/audit flag raised
  event_type      TEXT              NOT NULL,

  -- Arbitrary event-specific data (scorecard, delta, outcome metadata, etc.)
  payload         JSONB             NOT NULL DEFAULT '{}'::jsonb
);

COMMENT ON TABLE public.ats_events
  IS 'Append-only telemetry log. One row per scored event or outcome. Never UPDATE or DELETE rows — insert corrections as new events.';

-- ── Indexes ──────────────────────────────────────────────────────────────────

-- Calibration query: "what is P(interview) given ats_score bucket?"
-- Covered by payload->>'ats_score' — kept as BRIN for insert performance.
CREATE INDEX IF NOT EXISTS idx_ats_events_created_at
  ON public.ats_events USING BRIN (created_at);

-- Candidate timeline
CREATE INDEX IF NOT EXISTS idx_ats_events_candidate_created
  ON public.ats_events (candidate_id, created_at DESC)
  WHERE candidate_id IS NOT NULL;

-- Job-level aggregates
CREATE INDEX IF NOT EXISTS idx_ats_events_job_created
  ON public.ats_events (job_id, created_at DESC)
  WHERE job_id IS NOT NULL;

-- Match-level lookups (for shadow delta correlation)
CREATE INDEX IF NOT EXISTS idx_ats_events_match_created
  ON public.ats_events (match_id, created_at DESC)
  WHERE match_id IS NOT NULL;

-- KPI dashboards filtering by event type
CREATE INDEX IF NOT EXISTS idx_ats_events_type
  ON public.ats_events (event_type);

-- ── RLS: service-role writes, authenticated reads ────────────────────────────
ALTER TABLE public.ats_events ENABLE ROW LEVEL SECURITY;

-- Admins/recruiters can read all events
CREATE POLICY "ats_events_admin_recruiter_read" ON public.ats_events
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'recruiter'))
  );

-- Service-role (server-side) can insert — no authenticated INSERT via client
-- (all writes go through server-side helpers in src/lib/telemetry.ts)
CREATE POLICY "ats_events_service_insert" ON public.ats_events
  FOR INSERT WITH CHECK (auth.role() = 'service_role');
