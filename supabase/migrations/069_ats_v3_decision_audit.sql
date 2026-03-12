-- Full decision audit log — never update, only insert
CREATE TABLE IF NOT EXISTS ats_decision_audit (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id         UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  candidate_id           UUID NOT NULL,
  job_id                 UUID NOT NULL,
  resume_id              UUID,
  scoring_version        TEXT NOT NULL DEFAULT '3.0.0',
  -- Scores
  role_fit_score         INTEGER,
  readability_score      INTEGER,
  final_decision_score   INTEGER,
  -- Components
  eligibility_result     JSONB NOT NULL DEFAULT '{}',
  role_fit_breakdown     JSONB NOT NULL DEFAULT '{}',
  readability_breakdown  JSONB NOT NULL DEFAULT '{}',
  penalty_breakdown      JSONB NOT NULL DEFAULT '{}',
  confidence_result      JSONB NOT NULL DEFAULT '{}',
  family_match           JSONB NOT NULL DEFAULT '{}',
  -- Decision
  decision_action        TEXT NOT NULL,
  decision_summary       TEXT,
  -- Output contracts
  candidate_output       JSONB NOT NULL DEFAULT '{}',
  recruiter_output       JSONB NOT NULL DEFAULT '{}',
  -- Timing
  scored_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ats_audit_application ON ats_decision_audit(application_id);
CREATE INDEX idx_ats_audit_scored_at ON ats_decision_audit(scored_at DESC);

