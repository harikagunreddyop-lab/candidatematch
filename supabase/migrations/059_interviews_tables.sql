-- 059_interviews_tables.sql
-- Interview scheduling, prep questions, and mock interview sessions.

-- Interviews: linked to application + job + candidate
CREATE TABLE IF NOT EXISTS public.interviews (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id        UUID REFERENCES public.applications(id) ON DELETE CASCADE,
  candidate_id          UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  job_id                UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  interview_type         TEXT CHECK (interview_type IS NULL OR interview_type IN ('phone', 'video', 'onsite', 'technical', 'behavioral', 'case_study')),
  scheduled_at           TIMESTAMPTZ NOT NULL,
  duration_minutes       INT NOT NULL DEFAULT 60,
  timezone               TEXT,
  virtual_meeting_link   TEXT,
  location               TEXT,
  interviewer_name      TEXT,
  interviewer_title      TEXT,
  interviewer_email     TEXT,
  interviewer_linkedin   TEXT,
  preparation_notes      TEXT,
  post_interview_notes   TEXT,
  self_assessment_score  INT CHECK (self_assessment_score IS NULL OR (self_assessment_score >= 1 AND self_assessment_score <= 10)),
  outcome                TEXT CHECK (outcome IS NULL OR outcome IN ('passed', 'rejected', 'pending', 'cancelled')),
  thank_you_sent         BOOLEAN NOT NULL DEFAULT false,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_interviews_candidate ON public.interviews(candidate_id);
CREATE INDEX IF NOT EXISTS idx_interviews_application ON public.interviews(application_id);
CREATE INDEX IF NOT EXISTS idx_interviews_scheduled ON public.interviews(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_interviews_job ON public.interviews(job_id);

COMMENT ON TABLE public.interviews IS 'Scheduled interviews for candidates; links to application and job.';

ALTER TABLE public.interviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "interviews_candidate_own" ON public.interviews
  FOR ALL USING (
    candidate_id IN (SELECT id FROM public.candidates WHERE user_id = auth.uid())
  );

-- Keep updated_at in sync on UPDATE
CREATE OR REPLACE FUNCTION public.set_interviews_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_interviews_updated_at ON public.interviews;
CREATE TRIGGER set_interviews_updated_at
  BEFORE UPDATE ON public.interviews
  FOR EACH ROW EXECUTE FUNCTION public.set_interviews_updated_at();

-- interview_questions_prep: per-interview Q&A and STAR
CREATE TABLE IF NOT EXISTS public.interview_questions_prep (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  interview_id   UUID NOT NULL REFERENCES public.interviews(id) ON DELETE CASCADE,
  question_text  TEXT NOT NULL,
  candidate_answer TEXT,
  star_method    JSONB,
  ai_feedback    TEXT,
  is_practiced   BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_interview_questions_prep_interview ON public.interview_questions_prep(interview_id);

COMMENT ON COLUMN public.interview_questions_prep.star_method IS 'JSON: { situation, task, action, result }';

ALTER TABLE public.interview_questions_prep ENABLE ROW LEVEL SECURITY;

CREATE POLICY "interview_questions_prep_via_interview" ON public.interview_questions_prep
  FOR ALL USING (
    interview_id IN (
      SELECT i.id FROM public.interviews i
      JOIN public.candidates c ON c.id = i.candidate_id AND c.user_id = auth.uid()
    )
  );

-- mock_interview_sessions: AI mock sessions
CREATE TABLE IF NOT EXISTS public.mock_interview_sessions (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  candidate_id      UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  interview_id      UUID REFERENCES public.interviews(id) ON DELETE SET NULL,
  session_type      TEXT CHECK (session_type IS NULL OR session_type IN ('behavioral', 'technical', 'case_study', 'mixed')),
  questions_asked   JSONB NOT NULL DEFAULT '[]',
  responses         JSONB NOT NULL DEFAULT '[]',
  ai_feedback       JSONB,
  overall_score     INT CHECK (overall_score IS NULL OR (overall_score >= 0 AND overall_score <= 100)),
  confidence_score  INT CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 100)),
  duration_seconds  INT,
  completed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mock_interview_sessions_candidate ON public.mock_interview_sessions(candidate_id);
CREATE INDEX IF NOT EXISTS idx_mock_interview_sessions_interview ON public.mock_interview_sessions(interview_id);

ALTER TABLE public.mock_interview_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mock_interview_sessions_candidate_own" ON public.mock_interview_sessions
  FOR ALL USING (
    candidate_id IN (SELECT id FROM public.candidates WHERE user_id = auth.uid())
  );
