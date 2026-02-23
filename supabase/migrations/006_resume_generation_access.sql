-- Allow admins to grant recruiters access to the resume generation feature.
-- Only recruiters with resume_generation_allowed = true can trigger AI resume generation.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS resume_generation_allowed BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.resume_generation_allowed IS 'If true (recruiter only), this user can use the AI resume generation feature. Admins always have access.';
