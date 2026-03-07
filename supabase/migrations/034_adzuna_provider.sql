-- Add Adzuna as a supported ingest provider
-- ============================================================================

ALTER TABLE public.ingest_connectors
  DROP CONSTRAINT IF EXISTS ingest_connectors_provider_check;

ALTER TABLE public.ingest_connectors
  ADD CONSTRAINT ingest_connectors_provider_check
  CHECK (provider IN ('greenhouse', 'lever', 'ashby', 'adzuna'));

COMMENT ON TABLE public.ingest_connectors IS 'Job board connectors (Greenhouse, Lever, Ashby, Adzuna)';
