-- Add resume_text to resume_versions for ATS scoring of DOCX tailored resumes
-- (Plain text stored at generation time; avoids parsing DOCX for ATS checks)
ALTER TABLE public.resume_versions
  ADD COLUMN IF NOT EXISTS resume_text TEXT;

COMMENT ON COLUMN public.resume_versions.resume_text IS 'Plain text of tailored resume for ATS scoring (populated when DOCX is generated)';
