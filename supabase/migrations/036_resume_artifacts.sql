-- 036_resume_artifacts.sql
-- Resume Gen v3: cached content + rendered outputs

CREATE TABLE IF NOT EXISTS resume_artifacts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id   uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  job_id         uuid REFERENCES jobs(id) ON DELETE SET NULL,
  template_id    text NOT NULL DEFAULT 'ats-classic',
  content_hash   text NOT NULL,
  content_json   jsonb NOT NULL DEFAULT '{}',
  coverage_json  jsonb,
  docx_url       text,
  pdf_url        text,
  status         text NOT NULL DEFAULT 'queued'
                   CHECK (status IN ('queued','generating','rendering','ready','failed')),
  error_json     jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (content_hash, template_id)
);

CREATE INDEX IF NOT EXISTS idx_artifacts_candidate ON resume_artifacts(candidate_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_hash ON resume_artifacts(content_hash);
CREATE INDEX IF NOT EXISTS idx_artifacts_status ON resume_artifacts(status);

-- RLS
ALTER TABLE resume_artifacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_artifacts" ON resume_artifacts FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "candidate_read_own_artifacts" ON resume_artifacts FOR SELECT
  USING (candidate_id IN (SELECT id FROM candidates WHERE user_id = auth.uid()));

CREATE POLICY "recruiter_read_assigned_artifacts" ON resume_artifacts FOR SELECT
  USING (candidate_id IN (
    SELECT candidate_id FROM recruiter_candidate_assignments
    WHERE recruiter_id = auth.uid()
  ));
