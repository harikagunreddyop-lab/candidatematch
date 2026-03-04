-- ============================================================================
-- Board discovery + connectors uniqueness
-- ============================================================================

-- Ensure ingest_connectors has unique constraint for upserts
ALTER TABLE public.ingest_connectors
  ADD CONSTRAINT ingest_connectors_provider_source_org_key
  UNIQUE (provider, source_org);

-- Board discoveries log
CREATE TABLE IF NOT EXISTS public.board_discoveries (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name       TEXT,
  website            TEXT,
  detected_provider  TEXT,
  detected_source_org TEXT,
  discovered_from_url TEXT,
  validated          BOOLEAN NOT NULL DEFAULT false,
  validation_status  INTEGER,
  last_error         TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_board_discoveries_company
  ON public.board_discoveries (company_name);

CREATE INDEX IF NOT EXISTS idx_board_discoveries_website
  ON public.board_discoveries (website);
