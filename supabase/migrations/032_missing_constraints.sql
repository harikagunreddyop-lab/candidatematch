-- Migration 032: Add missing production-safety DB constraints
-- All changes are idempotent (CREATE INDEX IF NOT EXISTS / DO blocks).
-- Run in a low-traffic window. Safe to reapply.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. jobs: partial unique index on (source, source_job_id)
--    Prevents duplicate rows when the same external job is ingested or
--    manually uploaded twice with the same (source, source_job_id) pair.
--    Partial (WHERE source_job_id IS NOT NULL) so NULLs remain unaffected.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS jobs_source_source_job_id_uidx
  ON jobs (source, source_job_id)
  WHERE source_job_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. ingest_jobs: unique constraint on (provider, source_org, source_job_id)
--    The upsert in src/ingest/sync.ts relies on this at the DB level.
--    Using DO block so the migration is idempotent.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ingest_jobs_provider_source_org_source_job_id_key'
      AND conrelid = 'ingest_jobs'::regclass
  ) THEN
    ALTER TABLE ingest_jobs
      ADD CONSTRAINT ingest_jobs_provider_source_org_source_job_id_key
      UNIQUE (provider, source_org, source_job_id);
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. candidate_job_matches: unique constraint on (candidate_id, job_id)
--    Should already exist from migration 001; adding IF NOT EXISTS guard.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'candidate_job_matches_candidate_id_job_id_key'
      AND conrelid = 'candidate_job_matches'::regclass
  ) THEN
    ALTER TABLE candidate_job_matches
      ADD CONSTRAINT candidate_job_matches_candidate_id_job_id_key
      UNIQUE (candidate_id, job_id);
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. application_field_mappings: unique index for autofill upsert
--    The POST /api/autofill/mappings upserts on this 4-column key.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS application_field_mappings_upsert_uidx
  ON application_field_mappings (user_id, domain, ats_type, field_fingerprint);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Supporting performance indexes
-- ─────────────────────────────────────────────────────────────────────────────

-- Speed up ingest_jobs lookups by connector
CREATE INDEX IF NOT EXISTS ingest_jobs_provider_source_org_idx
  ON ingest_jobs (provider, source_org);

-- Speed up jobs lookup by ingest_job_id (used in promote.ts)
CREATE INDEX IF NOT EXISTS jobs_ingest_job_id_idx
  ON jobs (ingest_job_id)
  WHERE ingest_job_id IS NOT NULL;

-- Speed up candidate_job_matches lookups by candidate
CREATE INDEX IF NOT EXISTS candidate_job_matches_candidate_id_idx
  ON candidate_job_matches (candidate_id);

-- Speed up candidate_job_matches lookups by job  
CREATE INDEX IF NOT EXISTS candidate_job_matches_job_id_idx
  ON candidate_job_matches (job_id);
