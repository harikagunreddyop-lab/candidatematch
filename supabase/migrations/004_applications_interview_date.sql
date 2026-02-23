-- Applications: interview date (for candidate/recruiter tracking)
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS interview_date DATE;
