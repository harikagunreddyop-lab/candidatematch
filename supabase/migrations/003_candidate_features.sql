-- Candidate features: saved jobs, application notes, reminders, pitch, last seen
-- Run after 001_initial.sql and 002_recruiter_assignments_rls.sql

-- Saved jobs (bookmarks)
CREATE TABLE IF NOT EXISTS public.candidate_saved_jobs (
  candidate_id UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  job_id       UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (candidate_id, job_id)
);
CREATE INDEX IF NOT EXISTS idx_candidate_saved_jobs_candidate ON public.candidate_saved_jobs(candidate_id);

-- Application reminders (candidate-set follow-up)
CREATE TABLE IF NOT EXISTS public.application_reminders (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  candidate_id   UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  remind_at      TIMESTAMPTZ NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_application_reminders_candidate ON public.application_reminders(candidate_id);
CREATE INDEX IF NOT EXISTS idx_application_reminders_remind_at ON public.application_reminders(remind_at);

-- Applications: candidate-private notes, interview notes, which uploaded resume used
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS candidate_notes TEXT,
  ADD COLUMN IF NOT EXISTS interview_notes TEXT,
  ADD COLUMN IF NOT EXISTS candidate_resume_id UUID REFERENCES public.candidate_resumes(id) ON DELETE SET NULL;

-- Candidates: default pitch and last seen (for "new matches" highlight)
ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS default_pitch TEXT,
  ADD COLUMN IF NOT EXISTS last_seen_matches_at TIMESTAMPTZ;

-- RLS for candidate_saved_jobs
ALTER TABLE public.candidate_saved_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "candidate_saved_jobs_own" ON public.candidate_saved_jobs
  FOR ALL USING (
    candidate_id IN (SELECT id FROM public.candidates WHERE user_id = auth.uid())
  );
CREATE POLICY "candidate_saved_jobs_admin_recruiter" ON public.candidate_saved_jobs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'recruiter'))
  );

-- RLS for application_reminders
ALTER TABLE public.application_reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "application_reminders_own" ON public.application_reminders
  FOR ALL USING (
    candidate_id IN (SELECT id FROM public.candidates WHERE user_id = auth.uid())
  );
CREATE POLICY "application_reminders_admin_recruiter" ON public.application_reminders
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'recruiter'))
  );

-- Allow candidate to update own profile (preferences, default_pitch, last_seen_matches_at)
CREATE POLICY "candidates_update_own" ON public.candidates
  FOR UPDATE USING (user_id = auth.uid());

-- Allow candidate to insert/update own applications (for apply, candidate_notes, interview_notes, candidate_resume_id)
CREATE POLICY "applications_candidate_insert" ON public.applications
  FOR INSERT WITH CHECK (
    candidate_id IN (SELECT id FROM public.candidates WHERE user_id = auth.uid())
  );
CREATE POLICY "applications_candidate_update" ON public.applications
  FOR UPDATE USING (
    candidate_id IN (SELECT id FROM public.candidates WHERE user_id = auth.uid())
  );
