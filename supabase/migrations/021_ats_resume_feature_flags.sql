-- Admin-controlled ATS and resume features
-- recruiter_run_ats_check: recruiters can run on-demand ATS (default true)
-- candidate_tailor_resume: candidates can request tailored resumes (default true)

INSERT INTO public.feature_flags (key, value, role) VALUES
  ('recruiter_run_ats_check', 'true', 'recruiter'),
  ('candidate_tailor_resume', 'true', 'candidate')
ON CONFLICT (key) DO NOTHING;
