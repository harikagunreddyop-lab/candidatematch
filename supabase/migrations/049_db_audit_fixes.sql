-- =============================================================================
-- 049_db_audit_fixes.sql — Idempotent DB hygiene (run after db-audit.sql)
-- 1. Set search_path = public on any public function that lacks it (linter 0011).
-- 2. No RLS/Policy changes here: fix those per migration or manually.
-- =============================================================================

-- Set search_path on all public schema functions that don't have it
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND (p.proconfig IS NULL OR NOT (
        EXISTS (SELECT 1 FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) c WHERE c = 'search_path=public')
        OR EXISTS (SELECT 1 FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) c WHERE c LIKE 'search_path=%')
      ))
  )
  LOOP
    EXECUTE format(
      'ALTER FUNCTION public.%I(%s) SET search_path = public',
      r.proname,
      r.args
    );
  END LOOP;
END $$;
