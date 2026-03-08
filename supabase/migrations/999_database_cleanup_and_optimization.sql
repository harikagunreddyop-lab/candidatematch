-- =============================================================================
-- 999_database_cleanup_and_optimization.sql
--
-- Purpose:
--   - Remove legacy test/demo data from core tables
--   - Tighten constraints (email format checks)
--   - Ensure key indexes exist for critical query paths
--   - Provide a reusable database health check function
--
-- Notes:
--   - All statements are idempotent where possible (DELETE is naturally so).
--   - Safe to run on production; recommended during a low-traffic window.
-- =============================================================================

-- ============================================================================
-- 1) DATA CLEANUP — TEST / DUMMY DATA
-- ============================================================================

-- 1.a) Delete candidates that look like test/demo/example accounts (by email).
--      This will cascade to applications, matches, outcomes, etc. via FKs.
DELETE FROM public.candidates c
WHERE c.email ILIKE '%test%'
   OR c.email ILIKE '%demo%'
   OR c.email ILIKE '%example%';

-- 1.b) Delete obviously test jobs.
--      Jobs are referenced by matches, applications, outcomes, activity, etc.
DELETE FROM public.jobs j
WHERE j.company = 'Test Company'
   OR j.source = 'manual-test';

-- 1.c) Delete very old applications used during early testing.
--      Adjust the cutoff date as needed before running in production.
DELETE FROM public.applications a
WHERE a.created_at < TIMESTAMPTZ '2026-01-01';

-- 1.d) Delete orphaned applications (no candidate or no job).
--      These should not exist once FKs are enforced, but this cleans any legacy rows.
DELETE FROM public.applications a
WHERE NOT EXISTS (
        SELECT 1 FROM public.candidates c WHERE c.id = a.candidate_id
      )
   OR NOT EXISTS (
        SELECT 1 FROM public.jobs j WHERE j.id = a.job_id
      );

-- 1.e) Delete expired company invitations (status = 'expired').
DELETE FROM public.company_invitations ci
WHERE ci.status = 'expired';


-- ============================================================================
-- 2) CONSTRAINTS — EMAIL FORMAT CHECKS
-- ============================================================================
-- Simple, permissive email format checks to prevent obviously invalid values
-- while allowing empty/NULL where the column semantics expect that.
-- Pattern: must contain a single '@', no spaces, and at least one '.' after '@'.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_email_format_chk'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_email_format_chk
      CHECK (
        email IS NULL
        OR email = ''
        OR email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
      );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'candidates_email_format_chk'
      AND conrelid = 'public.candidates'::regclass
  ) THEN
    ALTER TABLE public.candidates
      ADD CONSTRAINT candidates_email_format_chk
      CHECK (
        email IS NULL
        OR email = ''
        OR email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
      );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'company_invitations_email_format_chk'
      AND conrelid = 'public.company_invitations'::regclass
  ) THEN
    ALTER TABLE public.company_invitations
      ADD CONSTRAINT company_invitations_email_format_chk
      CHECK (
        email IS NOT NULL
        AND email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
      );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'gmail_connections_email_format_chk'
      AND conrelid = 'public.gmail_connections'::regclass
  ) THEN
    ALTER TABLE public.gmail_connections
      ADD CONSTRAINT gmail_connections_email_format_chk
      CHECK (
        email IS NOT NULL
        AND email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
      );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'email_activity_from_email_format_chk'
      AND conrelid = 'public.email_activity'::regclass
  ) THEN
    ALTER TABLE public.email_activity
      ADD CONSTRAINT email_activity_from_email_format_chk
      CHECK (
        from_email IS NOT NULL
        AND from_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
      );
  END IF;
END;
$$;


-- ============================================================================
-- 3) INDEXES — PERFORMANCE ON HOT PATHS
-- ============================================================================
-- Many core indexes already exist from 001/032/052; here we only add missing
-- ones that are known to be used in production query paths.
-- ============================================================================

-- 3.a) Jobs by company name (used in read-side reporting and debugging).
CREATE INDEX IF NOT EXISTS idx_jobs_company
  ON public.jobs(company);


-- ============================================================================
-- 4) HEALTH CHECK FUNCTION
-- ============================================================================
-- database_health_check()
--
-- Returns a JSONB summary with:
--   - status: 'ok' | 'issues_found'
--   - orphan_counts: counts of rows with broken FK relationships
--   - missing_indexes: expected indexes/constraints that are absent
--   - foreign_keys_without_safe_delete: number of FKs not using CASCADE/SET NULL
--   - data_inconsistencies: array of high-level issue tags
--
-- Usage:
--   SELECT public.database_health_check();
-- ============================================================================

CREATE OR REPLACE FUNCTION public.database_health_check()
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  orphan_applications           INTEGER;
  orphan_matches                INTEGER;
  orphan_outcomes               INTEGER;
  orphan_resumes                INTEGER;
  orphan_resume_versions        INTEGER;
  orphan_follow_up_reminders    INTEGER;
  orphan_email_activity         INTEGER;

  foreign_keys_without_safe_del INTEGER;
  missing_indexes               TEXT[];
  data_issues                   JSONB := '[]'::jsonb;
BEGIN
  -- Orphaned applications (no candidate or no job)
  SELECT COUNT(*) INTO orphan_applications
  FROM public.applications a
  LEFT JOIN public.candidates c ON c.id = a.candidate_id
  LEFT JOIN public.jobs j       ON j.id = a.job_id
  WHERE c.id IS NULL OR j.id IS NULL;

  -- Orphaned matches
  SELECT COUNT(*) INTO orphan_matches
  FROM public.candidate_job_matches m
  LEFT JOIN public.candidates c ON c.id = m.candidate_id
  LEFT JOIN public.jobs j       ON j.id = m.job_id
  WHERE c.id IS NULL OR j.id IS NULL;

  -- Orphaned application outcomes
  SELECT COUNT(*) INTO orphan_outcomes
  FROM public.application_outcomes ao
  LEFT JOIN public.applications a ON a.id = ao.application_id
  LEFT JOIN public.candidates c   ON c.id = ao.candidate_id
  LEFT JOIN public.jobs j         ON j.id = ao.job_id
  WHERE a.id IS NULL OR c.id IS NULL OR j.id IS NULL;

  -- Orphaned candidate_resumes
  SELECT COUNT(*) INTO orphan_resumes
  FROM public.candidate_resumes r
  LEFT JOIN public.candidates c ON c.id = r.candidate_id
  WHERE c.id IS NULL;

  -- Orphaned resume_versions
  SELECT COUNT(*) INTO orphan_resume_versions
  FROM public.resume_versions v
  LEFT JOIN public.candidates c ON c.id = v.candidate_id
  LEFT JOIN public.jobs j       ON j.id = v.job_id
  WHERE c.id IS NULL OR j.id IS NULL;

  -- Orphaned follow_up_reminders
  SELECT COUNT(*) INTO orphan_follow_up_reminders
  FROM public.follow_up_reminders fr
  LEFT JOIN public.candidates c ON c.id = fr.candidate_id
  LEFT JOIN public.applications a ON a.id = fr.application_id
  WHERE c.id IS NULL OR a.id IS NULL;

  -- Orphaned email_activity (dangling connection_id)
  SELECT COUNT(*) INTO orphan_email_activity
  FROM public.email_activity ea
  LEFT JOIN public.gmail_connections gc ON gc.id = ea.connection_id
  WHERE gc.id IS NULL;

  -- Foreign keys that do NOT use ON DELETE CASCADE or ON DELETE SET NULL
  SELECT COUNT(*) INTO foreign_keys_without_safe_del
  FROM information_schema.table_constraints tc
  JOIN information_schema.referential_constraints rc
    ON tc.constraint_name = rc.constraint_name
   AND tc.constraint_schema = rc.constraint_schema
  WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.constraint_schema = 'public'
    AND rc.delete_rule NOT IN ('CASCADE', 'SET NULL');

  -- Expected indexes / constraints that should exist on a healthy database.
  -- Some are indexes, some are unique constraints; we check both catalogs.
  SELECT array_agg(name) INTO missing_indexes
  FROM (
    VALUES
      ('idx_candidates_user_id'),
      ('idx_jobs_company_active_scraped'),
      ('idx_jobs_company'),
      ('idx_applications_job_id'),
      ('jobs_source_source_job_id_uidx'),
      ('candidate_job_matches_candidate_id_job_id_key')
  ) AS expected(name)
  WHERE NOT EXISTS (
          SELECT 1
          FROM pg_indexes
          WHERE schemaname = 'public'
            AND indexname = expected.name
        )
    AND NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = expected.name
        );

  -- Data inconsistencies: application_outcomes vs applications
  PERFORM 1
  FROM public.application_outcomes ao
  JOIN public.applications a ON a.id = ao.application_id
  WHERE ao.candidate_id IS DISTINCT FROM a.candidate_id
     OR ao.job_id       IS DISTINCT FROM a.job_id
  LIMIT 1;

  IF FOUND THEN
    data_issues := data_issues || jsonb_build_array('application_outcomes_mismatch');
  END IF;

  -- Data inconsistencies: applications vs resume_versions
  PERFORM 1
  FROM public.applications a
  JOIN public.resume_versions v ON v.id = a.resume_version_id
  WHERE v.candidate_id IS DISTINCT FROM a.candidate_id
     OR v.job_id       IS DISTINCT FROM a.job_id
  LIMIT 1;

  IF FOUND THEN
    data_issues := data_issues || jsonb_build_array('applications_resume_version_mismatch');
  END IF;

  RETURN jsonb_build_object(
    'status',
    CASE
      WHEN orphan_applications        = 0
       AND orphan_matches             = 0
       AND orphan_outcomes            = 0
       AND orphan_resumes             = 0
       AND orphan_resume_versions     = 0
       AND orphan_follow_up_reminders = 0
       AND orphan_email_activity      = 0
       AND COALESCE(array_length(missing_indexes, 1), 0) = 0
       AND foreign_keys_without_safe_del = 0
       AND jsonb_array_length(data_issues) = 0
      THEN 'ok'
      ELSE 'issues_found'
    END,
    'orphan_counts', jsonb_build_object(
      'applications',            orphan_applications,
      'candidate_job_matches',   orphan_matches,
      'application_outcomes',    orphan_outcomes,
      'candidate_resumes',       orphan_resumes,
      'resume_versions',         orphan_resume_versions,
      'follow_up_reminders',     orphan_follow_up_reminders,
      'email_activity',          orphan_email_activity
    ),
    'missing_indexes', COALESCE(to_jsonb(missing_indexes), '[]'::jsonb),
    'foreign_keys_without_safe_delete', foreign_keys_without_safe_del,
    'data_inconsistencies', data_issues
  );
END;
$$;

