-- 035_application_runs.sql
-- Queue-First Architecture: application_runs, run_steps, application_outcomes

-- ── application_runs ─────────────────────────────────────────────────────────
-- One run = a complete automated loop from intent → match → score → tailor → apply
CREATE TABLE IF NOT EXISTS application_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id  uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  status        text NOT NULL DEFAULT 'queued'
                  CHECK (status IN ('queued','running','needs_user','completed','failed')),
  intent        jsonb NOT NULL DEFAULT '{}',
  metrics       jsonb NOT NULL DEFAULT '{}',
  error_message text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_runs_candidate ON application_runs(candidate_id);
CREATE INDEX IF NOT EXISTS idx_runs_status ON application_runs(status);

-- ── run_steps ────────────────────────────────────────────────────────────────
-- Each step in the pipeline
CREATE TABLE IF NOT EXISTS run_steps (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id      uuid NOT NULL REFERENCES application_runs(id) ON DELETE CASCADE,
  step        text NOT NULL CHECK (step IN ('ingest','match','score','tailor','apply','track')),
  status      text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','running','completed','failed','skipped')),
  started_at  timestamptz,
  ended_at    timestamptz,
  input_json  jsonb DEFAULT '{}',
  output_json jsonb DEFAULT '{}',
  error_json  jsonb
);

CREATE INDEX IF NOT EXISTS idx_steps_run ON run_steps(run_id);

-- ── application_outcomes ─────────────────────────────────────────────────────
-- Closed-loop learning: what *actually* happens after apply
CREATE TABLE IF NOT EXISTS application_outcomes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id  uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  candidate_id    uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  job_id          uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  outcome         text NOT NULL CHECK (outcome IN ('interview','reject','offer','pending','ghosted')),
  outcome_date    timestamptz,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (application_id)
);

CREATE INDEX IF NOT EXISTS idx_outcomes_candidate ON application_outcomes(candidate_id);
CREATE INDEX IF NOT EXISTS idx_outcomes_job ON application_outcomes(job_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE application_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE run_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_outcomes ENABLE ROW LEVEL SECURITY;

-- Admin: full access
CREATE POLICY "admin_all_runs" ON application_runs FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "admin_all_steps" ON run_steps FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "admin_all_outcomes" ON application_outcomes FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Candidates: read own runs
CREATE POLICY "candidate_read_own_runs" ON application_runs FOR SELECT
  USING (
    candidate_id IN (
      SELECT id FROM candidates WHERE user_id = auth.uid()
    )
  );

-- Candidates: read own steps (via run)
CREATE POLICY "candidate_read_own_steps" ON run_steps FOR SELECT
  USING (
    run_id IN (
      SELECT ar.id FROM application_runs ar
      JOIN candidates c ON c.id = ar.candidate_id
      WHERE c.user_id = auth.uid()
    )
  );

-- Candidates: read own outcomes
CREATE POLICY "candidate_read_own_outcomes" ON application_outcomes FOR SELECT
  USING (
    candidate_id IN (
      SELECT id FROM candidates WHERE user_id = auth.uid()
    )
  );

-- Recruiters: read runs for assigned candidates
CREATE POLICY "recruiter_read_assigned_runs" ON application_runs FOR SELECT
  USING (
    candidate_id IN (
      SELECT candidate_id FROM recruiter_candidate_assignments
      WHERE recruiter_id = auth.uid()
    )
  );
