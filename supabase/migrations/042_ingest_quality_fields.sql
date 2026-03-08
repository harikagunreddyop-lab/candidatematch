-- Quality scoring and spam/rejection fields for ingest_jobs (10k+ jobs/day pipeline)
ALTER TABLE public.ingest_jobs
  ADD COLUMN IF NOT EXISTS quality_score INTEGER,
  ADD COLUMN IF NOT EXISTS quality_flags TEXT[],
  ADD COLUMN IF NOT EXISTS is_spam BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

COMMENT ON COLUMN public.ingest_jobs.quality_score IS '0-100 quality score from quality-scorer';
COMMENT ON COLUMN public.ingest_jobs.quality_flags IS 'Flags e.g. INCOMPLETE_DATA, POOR_CLARITY, SUSPICIOUS';
COMMENT ON COLUMN public.ingest_jobs.is_spam IS 'Set when job was detected as spam by spam-detector';
COMMENT ON COLUMN public.ingest_jobs.rejection_reason IS 'Reason job was rejected (invalid/spam/low-quality) if not upserted';
