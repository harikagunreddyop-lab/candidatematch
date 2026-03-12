-- Add V3 columns to applications table
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS role_fit_score         INTEGER,
  ADD COLUMN IF NOT EXISTS readability_score      INTEGER,
  ADD COLUMN IF NOT EXISTS final_decision_score   INTEGER,
  ADD COLUMN IF NOT EXISTS family_match_type      TEXT,
  ADD COLUMN IF NOT EXISTS eligibility_status     TEXT,
  ADD COLUMN IF NOT EXISTS confidence_score       INTEGER,
  ADD COLUMN IF NOT EXISTS confidence_label       TEXT,
  ADD COLUMN IF NOT EXISTS penalty_summary        JSONB,
  ADD COLUMN IF NOT EXISTS decision_action        TEXT,
  ADD COLUMN IF NOT EXISTS decision_version       TEXT,
  ADD COLUMN IF NOT EXISTS decision_reasons       JSONB,
  ADD COLUMN IF NOT EXISTS critical_gaps          JSONB,
  ADD COLUMN IF NOT EXISTS adjacent_suggestions   JSONB,
  ADD COLUMN IF NOT EXISTS scored_at              TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_apps_role_fit ON applications(role_fit_score DESC) WHERE role_fit_score IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_apps_decision ON applications(decision_action) WHERE decision_action IS NOT NULL;

