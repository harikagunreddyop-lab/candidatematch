-- ============================================================================
-- 025_security_hardening.sql
-- RLS for tables previously unprotected. Defense in depth.
-- ============================================================================

-- human_review_requests: candidate can create/read own; admin/recruiter can read/update
ALTER TABLE public.human_review_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "human_review_candidate_own" ON public.human_review_requests
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.candidates c
      WHERE c.id = human_review_requests.candidate_id
        AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "human_review_admin_recruiter" ON public.human_review_requests
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'recruiter'))
  );

-- scrape_runs: admin only (service role bypasses RLS)
ALTER TABLE public.scrape_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scrape_runs_admin_only" ON public.scrape_runs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- cron_run_history: admin only
ALTER TABLE public.cron_run_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cron_run_admin_only" ON public.cron_run_history
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- scoring_runs: admin only (contains candidate/job refs)
ALTER TABLE public.scoring_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scoring_runs_admin_only" ON public.scoring_runs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- calibration_curves: admin only
ALTER TABLE public.calibration_curves ENABLE ROW LEVEL SECURITY;

CREATE POLICY "calibration_admin_only" ON public.calibration_curves
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- resume_embeddings: admin/recruiter only (service role bypasses; matching uses service)
ALTER TABLE public.resume_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "resume_embeddings_admin_recruiter" ON public.resume_embeddings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'recruiter'))
  );

-- admin_notifications: admin only
ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_notifications_admin_only" ON public.admin_notifications
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- user_presence: own row only
ALTER TABLE public.user_presence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_presence_own" ON public.user_presence
  FOR ALL USING (profile_id = auth.uid());
