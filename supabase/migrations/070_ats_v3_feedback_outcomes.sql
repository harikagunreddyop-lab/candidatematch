-- Recruiter overrides + human labels
CREATE TABLE IF NOT EXISTS ats_recruiter_feedback (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id        UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  reviewer_id           UUID NOT NULL,
  system_recommendation TEXT NOT NULL,
  human_decision        TEXT NOT NULL,
  override_reason       TEXT,
  manual_fit_score      INTEGER,
  manual_notes          TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Downstream outcomes — the ground truth for calibration
CREATE TABLE IF NOT EXISTS ats_outcome_labels (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id   UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  shortlisted      BOOLEAN,
  phone_screened   BOOLEAN,
  interviewed      BOOLEAN,
  hired            BOOLEAN,
  rejected         BOOLEAN,
  rejection_reason TEXT,
  captured_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(application_id)
);

