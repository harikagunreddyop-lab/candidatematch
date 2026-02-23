-- ============================================================================
-- CandidateMatch Resume Factory — Complete Database Migration
-- Synced with live schema as of Feb 2026
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- TABLES
-- ============================================================================

-- Profiles (extends auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL DEFAULT '',
  email           TEXT NOT NULL DEFAULT '',
  role            TEXT NOT NULL DEFAULT 'candidate' CHECK (role IN ('admin', 'recruiter', 'candidate')),
  avatar_url      TEXT,
  phone           TEXT,
  title           TEXT,
  company         TEXT,
  linkedin_url    TEXT,
  specializations TEXT[] DEFAULT '{}',
  bio             TEXT,
  internal_notes  TEXT,
  is_active       BOOLEAN DEFAULT TRUE,
  hired_count     INTEGER DEFAULT 0,
  timezone        TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Candidates
CREATE TABLE IF NOT EXISTS public.candidates (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name              TEXT NOT NULL,
  email                  TEXT,
  phone                  TEXT,
  location               TEXT,
  visa_status            TEXT,
  primary_title          TEXT NOT NULL,
  secondary_titles       TEXT[] DEFAULT '{}',
  skills                 JSONB DEFAULT '[]',
  experience             JSONB DEFAULT '[]',
  education              JSONB DEFAULT '[]',
  certifications         JSONB DEFAULT '[]',
  summary                TEXT DEFAULT '',
  linkedin_url           TEXT,
  portfolio_url          TEXT,
  github_url             TEXT,
  active                 BOOLEAN NOT NULL DEFAULT TRUE,
  user_id                UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  UNIQUE(user_id),
  assigned_recruiter_id  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- Professional details
  years_of_experience    INTEGER,
  salary_min             INTEGER,
  salary_max             INTEGER,
  salary_currency        TEXT DEFAULT 'USD',
  availability           TEXT,
  notice_period          TEXT,
  open_to_remote         BOOLEAN DEFAULT TRUE,
  open_to_relocation     BOOLEAN DEFAULT FALSE,
  target_locations       TEXT[] DEFAULT '{}',
  target_roles           TEXT[] DEFAULT '{}',
  target_companies       TEXT[] DEFAULT '{}',
  languages              JSONB DEFAULT '[]',
  soft_skills            TEXT[] DEFAULT '{}',
  tools                  TEXT[] DEFAULT '{}',
  work_authorization     TEXT,
  citizenship            TEXT,
  highest_education      TEXT,
  gpa                    TEXT,
  candidate_references   JSONB DEFAULT '[]',
  -- Recruiter fields
  internal_notes         TEXT,
  source                 TEXT DEFAULT 'manual',
  referred_by            TEXT,
  tags                   TEXT[] DEFAULT '{}',
  rating                 INTEGER,
  last_contacted_at      TIMESTAMPTZ,
  interview_notes        TEXT,
  -- Workflow
  onboarding_completed   BOOLEAN NOT NULL DEFAULT FALSE,
  approval_status        TEXT NOT NULL DEFAULT 'pending',
  approved_at            TIMESTAMPTZ,
  approved_by            UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  parsed_resume_text     TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Recruiter → Candidate assignments
CREATE TABLE IF NOT EXISTS public.recruiter_candidate_assignments (
  recruiter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  assigned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (recruiter_id, candidate_id)
);

-- Jobs
CREATE TABLE IF NOT EXISTS public.jobs (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source                 TEXT NOT NULL DEFAULT 'manual',
  source_job_id          TEXT,
  title                  TEXT NOT NULL,
  company                TEXT NOT NULL,
  location               TEXT,
  url                    TEXT,
  jd_raw                 TEXT,
  jd_clean               TEXT,
  salary_min             INTEGER,
  salary_max             INTEGER,
  job_type               TEXT,
  remote_type            TEXT,
  dedupe_hash            TEXT NOT NULL,
  is_active              BOOLEAN NOT NULL DEFAULT TRUE,
  scraped_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at             TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Structured data (populated after JD parsing)
  structured_requirements JSONB,
  must_have_skills        TEXT[] DEFAULT '{}',
  nice_to_have_skills     TEXT[] DEFAULT '{}',
  seniority_level         TEXT,
  min_years_experience    INTEGER,
  responsibilities        TEXT[] DEFAULT '{}',
  weighted_keywords       JSONB DEFAULT '{}',
  remote_requirement      TEXT,
  structure_hash          TEXT,
  structured_at           TIMESTAMPTZ
);

-- Candidate ↔ Job matches
CREATE TABLE IF NOT EXISTS public.candidate_job_matches (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  candidate_id         UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  job_id               UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  fit_score            INTEGER NOT NULL DEFAULT 0 CHECK (fit_score >= 0 AND fit_score <= 100),
  matched_keywords     TEXT[] DEFAULT '{}',
  missing_keywords     TEXT[] DEFAULT '{}',
  match_reason         TEXT,
  matched_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  score_breakdown      JSONB,
  decision             TEXT,
  optimization_attempts INTEGER DEFAULT 0,
  last_optimized_at    TIMESTAMPTZ,
  UNIQUE(candidate_id, job_id)
);

-- Candidate uploaded resumes (PDFs uploaded by candidate or admin)
CREATE TABLE IF NOT EXISTS public.candidate_resumes (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  candidate_id         UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  label                TEXT NOT NULL DEFAULT 'Resume',
  pdf_path             TEXT NOT NULL,
  file_name            TEXT NOT NULL,
  file_size            INTEGER,
  uploaded_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  uploaded_by          UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- AI-parsed data
  structured_data      JSONB,
  extracted_skills     TEXT[] DEFAULT '{}',
  extracted_tools      TEXT[] DEFAULT '{}',
  bullets              JSONB DEFAULT '[]',
  total_experience_years INTEGER,
  ats_formatting_score INTEGER,
  structure_hash       TEXT,
  structured_at        TIMESTAMPTZ
);

-- Add FK from candidate_job_matches to candidate_resumes (defined after both tables exist)
ALTER TABLE public.candidate_job_matches
  ADD COLUMN IF NOT EXISTS best_resume_id UUID REFERENCES public.candidate_resumes(id) ON DELETE SET NULL;

-- AI-generated resume versions (tailored per job)
CREATE TABLE IF NOT EXISTS public.resume_versions (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  candidate_id      UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  job_id            UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  pdf_path          TEXT NOT NULL,
  bullets           JSONB DEFAULT '[]',
  generation_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (generation_status IN ('pending', 'generating', 'compiling', 'uploading', 'completed', 'failed')),
  error_message     TEXT,
  version_number    INTEGER NOT NULL DEFAULT 1,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Applications
CREATE TABLE IF NOT EXISTS public.applications (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  candidate_id       UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  job_id             UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  resume_version_id  UUID REFERENCES public.resume_versions(id) ON DELETE SET NULL,
  status             TEXT NOT NULL DEFAULT 'ready'
    CHECK (status IN ('ready', 'applied', 'screening', 'interview', 'offer', 'rejected', 'withdrawn')),
  applied_at         TIMESTAMPTZ,
  notes              TEXT,
  interview_date     TIMESTAMPTZ,
  offer_details      JSONB,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(candidate_id, job_id)
);

-- Scrape runs (tracking)
CREATE TABLE IF NOT EXISTS public.scrape_runs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id      TEXT NOT NULL,
  search_query  TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  jobs_found    INTEGER DEFAULT 0,
  jobs_new      INTEGER DEFAULT 0,
  jobs_duplicate INTEGER DEFAULT 0,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ,
  error_message TEXT
);

-- Messaging
CREATE TABLE IF NOT EXISTS public.conversations (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title      TEXT,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.conversation_participants (
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  profile_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_read_at    TIMESTAMPTZ,
  PRIMARY KEY (conversation_id, profile_id)
);

CREATE TABLE IF NOT EXISTS public.messages (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content         TEXT,
  attachment_path TEXT,
  attachment_name TEXT,
  attachment_type TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Admin notifications
CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type       TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT,
  data       JSONB DEFAULT '{}',
  read_by    UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User presence (online/offline)
CREATE TABLE IF NOT EXISTS public.user_presence (
  profile_id   UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_online    BOOLEAN NOT NULL DEFAULT FALSE
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

CREATE INDEX IF NOT EXISTS idx_candidates_active ON public.candidates(active);
CREATE INDEX IF NOT EXISTS idx_candidates_user_id ON public.candidates(user_id);
CREATE INDEX IF NOT EXISTS idx_candidates_assigned_recruiter ON public.candidates(assigned_recruiter_id);
CREATE INDEX IF NOT EXISTS idx_candidates_approval_status ON public.candidates(approval_status);

CREATE INDEX IF NOT EXISTS idx_jobs_dedupe_hash ON public.jobs(dedupe_hash);
CREATE INDEX IF NOT EXISTS idx_jobs_source ON public.jobs(source, source_job_id);
CREATE INDEX IF NOT EXISTS idx_jobs_active ON public.jobs(is_active);
CREATE INDEX IF NOT EXISTS idx_jobs_scraped_at ON public.jobs(scraped_at DESC);

CREATE INDEX IF NOT EXISTS idx_matches_candidate ON public.candidate_job_matches(candidate_id);
CREATE INDEX IF NOT EXISTS idx_matches_job ON public.candidate_job_matches(job_id);
CREATE INDEX IF NOT EXISTS idx_matches_score ON public.candidate_job_matches(fit_score DESC);

CREATE INDEX IF NOT EXISTS idx_candidate_resumes_candidate ON public.candidate_resumes(candidate_id);
CREATE INDEX IF NOT EXISTS idx_candidate_resumes_uploaded_at ON public.candidate_resumes(uploaded_at DESC);

CREATE INDEX IF NOT EXISTS idx_resume_versions_candidate ON public.resume_versions(candidate_id);
CREATE INDEX IF NOT EXISTS idx_resume_versions_status ON public.resume_versions(generation_status);

CREATE INDEX IF NOT EXISTS idx_applications_candidate ON public.applications(candidate_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON public.applications(status);
CREATE INDEX IF NOT EXISTS idx_applications_updated_at ON public.applications(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON public.messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON public.messages(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_conv_participants_profile ON public.conversation_participants(profile_id);

-- ============================================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================================

-- Auto-create profile on signup (preserves role from invite metadata)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1), ''),
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'candidate')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_profiles
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER set_updated_at_candidates
  BEFORE UPDATE ON public.candidates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER set_updated_at_applications
  BEFORE UPDATE ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER set_updated_at_conversations
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER set_updated_at_messages
  BEFORE UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_job_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_resumes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resume_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Profiles: users can see all profiles, edit only their own
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT USING (TRUE);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Candidates: admins/recruiters see all; candidates see their own
CREATE POLICY "candidates_admin_recruiter_all" ON public.candidates
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'recruiter'))
  );
CREATE POLICY "candidates_own" ON public.candidates
  FOR SELECT USING (user_id = auth.uid());

-- Jobs: everyone can read
CREATE POLICY "jobs_select_all" ON public.jobs FOR SELECT USING (TRUE);
CREATE POLICY "jobs_admin_write" ON public.jobs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'recruiter'))
  );

-- Matches: admins/recruiters see all; candidates see their own
CREATE POLICY "matches_admin_recruiter" ON public.candidate_job_matches
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'recruiter'))
  );
CREATE POLICY "matches_candidate_own" ON public.candidate_job_matches
  FOR SELECT USING (
    candidate_id IN (SELECT id FROM public.candidates WHERE user_id = auth.uid())
  );

-- Candidate resumes
CREATE POLICY "resumes_admin_recruiter" ON public.candidate_resumes
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'recruiter'))
  );
CREATE POLICY "resumes_candidate_own" ON public.candidate_resumes
  FOR ALL USING (
    candidate_id IN (SELECT id FROM public.candidates WHERE user_id = auth.uid())
  );

-- Resume versions
CREATE POLICY "resume_versions_admin_recruiter" ON public.resume_versions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'recruiter'))
  );
CREATE POLICY "resume_versions_candidate_own" ON public.resume_versions
  FOR SELECT USING (
    candidate_id IN (SELECT id FROM public.candidates WHERE user_id = auth.uid())
  );

-- Applications
CREATE POLICY "applications_admin_recruiter" ON public.applications
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'recruiter'))
  );
CREATE POLICY "applications_candidate_own" ON public.applications
  FOR SELECT USING (
    candidate_id IN (SELECT id FROM public.candidates WHERE user_id = auth.uid())
  );

-- Conversations: participants only
CREATE POLICY "conversations_participant" ON public.conversations
  FOR ALL USING (
    id IN (SELECT conversation_id FROM public.conversation_participants WHERE profile_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin'))
  );

CREATE POLICY "conv_participants_view" ON public.conversation_participants
  FOR SELECT USING (
    conversation_id IN (SELECT conversation_id FROM public.conversation_participants WHERE profile_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );
CREATE POLICY "conv_participants_insert" ON public.conversation_participants
  FOR INSERT WITH CHECK (TRUE);
CREATE POLICY "conv_participants_update_own" ON public.conversation_participants
  FOR UPDATE USING (profile_id = auth.uid());

CREATE POLICY "messages_participant" ON public.messages
  FOR ALL USING (
    conversation_id IN (SELECT conversation_id FROM public.conversation_participants WHERE profile_id = auth.uid())
  );