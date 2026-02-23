-- Adds all columns referenced in code but potentially missing from the database.
-- Safe to run multiple times (IF NOT EXISTS / idempotent).

-- candidates.default_pitch — elevator pitch / cover snippet (from migration 003)
ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS default_pitch TEXT;

-- candidates.last_seen_matches_at — tracks when candidate last viewed matches (from migration 003)
ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS last_seen_matches_at TIMESTAMPTZ;

-- profiles.resume_generation_allowed — admin-granted flag for recruiters (from migration 006)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS resume_generation_allowed BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.resume_generation_allowed
  IS 'If true (recruiter only), this user can use the AI resume generation feature. Admins always have access.';
