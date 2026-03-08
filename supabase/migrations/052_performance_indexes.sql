-- =============================================================================
-- 052_performance_indexes.sql — Additional indexes for enterprise upgrade plan
-- All CREATE INDEX IF NOT EXISTS; safe to run multiple times.
-- See docs/ENTERPRISE_UPGRADE_PLAN.md Section 3.1 (Change #14).
-- =============================================================================

/* Candidates: email lookups, onboarding funnel */
CREATE INDEX IF NOT EXISTS idx_candidates_email
  ON public.candidates(email)
  WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_candidates_onboarding
  ON public.candidates(onboarding_completed)
  WHERE onboarding_completed = false;

/* Jobs: company-scoped active job lists */
CREATE INDEX IF NOT EXISTS idx_jobs_company_active_scraped
  ON public.jobs(company_id, is_active, scraped_at DESC)
  WHERE is_active = true;

/* Applications: by job + status + time */
CREATE INDEX IF NOT EXISTS idx_applications_job_id
  ON public.applications(job_id);

CREATE INDEX IF NOT EXISTS idx_applications_job_status_created
  ON public.applications(job_id, status, created_at DESC);

/* Matches: by time, and high-score by candidate */
CREATE INDEX IF NOT EXISTS idx_matches_matched_at
  ON public.candidate_job_matches(matched_at DESC);

CREATE INDEX IF NOT EXISTS idx_matches_candidate_score
  ON public.candidate_job_matches(candidate_id, fit_score DESC, matched_at DESC)
  WHERE fit_score >= 70;

/* Conversation participants: by conversation */
CREATE INDEX IF NOT EXISTS idx_conv_participants_conversation_id
  ON public.conversation_participants(conversation_id);

COMMENT ON INDEX idx_jobs_company_active_scraped IS 'Company job listings (active only)';
COMMENT ON INDEX idx_matches_candidate_score IS 'Candidate match feed (high fit only)';
