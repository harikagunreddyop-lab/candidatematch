-- =============================================================================
-- Migration: CandidateMatch Autofill Extension tables
-- Run in Supabase SQL Editor (idempotent — safe to run multiple times)
-- =============================================================================

-- ─── 1. application_field_mappings ───────────────────────────────────────────
-- Stores per-user, per-domain, per-ATS field → profile_key knowledge.
-- Grows more accurate over time as users confirm mappings.

CREATE TABLE IF NOT EXISTS application_field_mappings (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  domain            text        NOT NULL,                          -- e.g. greenhouse.io
  ats_type          text        NOT NULL DEFAULT 'unknown',        -- workday|greenhouse|lever|icims|smartrecruiters|taleo|unknown
  field_fingerprint text        NOT NULL,                         -- djb2 hash of label+name+id+type+options
  field_label       text,                                         -- human-readable label (for display)
  field_meta        jsonb       NOT NULL DEFAULT '{}',             -- raw field attrs snapshot
  profile_key       text        NOT NULL,                         -- e.g. firstName, email, requiresSponsorship
  confidence        smallint    NOT NULL DEFAULT 50
                    CHECK (confidence BETWEEN 0 AND 100),
  last_used_at      timestamptz,
  use_count         integer     NOT NULL DEFAULT 0
);

-- Unique: one mapping per (user, domain, ats, field) — ON CONFLICT used for upsert
CREATE UNIQUE INDEX IF NOT EXISTS uidx_field_mappings
  ON application_field_mappings(user_id, domain, ats_type, field_fingerprint);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_field_mappings_updated_at ON application_field_mappings;
CREATE TRIGGER trg_field_mappings_updated_at
  BEFORE UPDATE ON application_field_mappings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE application_field_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see own field mappings"   ON application_field_mappings;
DROP POLICY IF EXISTS "Users insert own field mappings" ON application_field_mappings;
DROP POLICY IF EXISTS "Users update own field mappings" ON application_field_mappings;
DROP POLICY IF EXISTS "Users delete own field mappings" ON application_field_mappings;

CREATE POLICY "Users see own field mappings"
  ON application_field_mappings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own field mappings"
  ON application_field_mappings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own field mappings"
  ON application_field_mappings FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own field mappings"
  ON application_field_mappings FOR DELETE
  USING (auth.uid() = user_id);

-- ─── 2. application_fill_events ──────────────────────────────────────────────
-- Telemetry: one row per autofill run. Drives the "time saved" dashboard widget.

CREATE TABLE IF NOT EXISTS application_fill_events (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  user_id               uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  domain                text        NOT NULL,
  ats_type              text        NOT NULL DEFAULT 'unknown',
  page_url              text        NOT NULL,
  detected_fields       int         NOT NULL DEFAULT 0,
  filled_fields         int         NOT NULL DEFAULT 0,
  low_confidence_fields int         NOT NULL DEFAULT 0,
  time_saved_seconds    int         NOT NULL DEFAULT 0,
  corrections_count     int         NOT NULL DEFAULT 0,
  payload               jsonb       NOT NULL DEFAULT '{}'
);

-- RLS
ALTER TABLE application_fill_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see own fill events"    ON application_fill_events;
DROP POLICY IF EXISTS "Users insert own fill events" ON application_fill_events;

CREATE POLICY "Users see own fill events"
  ON application_fill_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own fill events"
  ON application_fill_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- No UPDATE/DELETE policy — events are append-only.

-- ─── Indexes for common queries ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_fill_events_user_created
  ON application_fill_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_field_mappings_user_domain_ats
  ON application_field_mappings(user_id, domain, ats_type);
