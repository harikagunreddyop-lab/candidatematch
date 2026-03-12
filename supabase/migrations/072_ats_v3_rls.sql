-- RLS for new tables
ALTER TABLE job_canonical_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_canonical_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE ats_decision_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE ats_recruiter_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE ats_outcome_labels ENABLE ROW LEVEL SECURITY;

-- job_canonical_profiles: readable by company members for that job
CREATE POLICY "company_read_job_profiles" ON job_canonical_profiles
  FOR SELECT USING (
    job_id IN (
      SELECT id FROM jobs WHERE company_id IN (
        SELECT company_id FROM company_members WHERE user_id = auth.uid()
      )
    )
  );

-- candidate_canonical_profiles: candidate reads own, company reads for applicants
CREATE POLICY "candidate_own_profile" ON candidate_canonical_profiles
  FOR SELECT USING (candidate_id = auth.uid());

CREATE POLICY "company_read_candidate_profiles" ON candidate_canonical_profiles
  FOR SELECT USING (
    candidate_id IN (
      SELECT candidate_id FROM applications WHERE job_id IN (
        SELECT id FROM jobs WHERE company_id IN (
          SELECT company_id FROM company_members WHERE user_id = auth.uid()
        )
      )
    )
  );

-- ats_decision_audit: company reads for their jobs, candidate reads own
CREATE POLICY "company_read_audit" ON ats_decision_audit
  FOR SELECT USING (
    job_id IN (
      SELECT id FROM jobs WHERE company_id IN (
        SELECT company_id FROM company_members WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "candidate_read_own_audit" ON ats_decision_audit
  FOR SELECT USING (candidate_id = auth.uid());

