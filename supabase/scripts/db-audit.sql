/* =============================================================================
   DB audit: check PKs, RLS, policies, function search_path
   Run in Supabase SQL Editor or: psql $DATABASE_URL -f supabase/scripts/db-audit.sql
   ============================================================================= */

/* A) Base tables WITHOUT a primary key (should be empty) */
SELECT t.table_schema, t.table_name
FROM information_schema.tables t
WHERE t.table_schema = 'public'
  AND t.table_type = 'BASE TABLE'
  AND t.table_name NOT LIKE 'pg_%'
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    WHERE tc.table_schema = t.table_schema
      AND tc.table_name = t.table_name
      AND tc.constraint_type = 'PRIMARY KEY'
  )
ORDER BY t.table_name;

/* B) Tables with RLS ENABLED but ZERO policies (broken: no one can access) */
SELECT c.relname AS table_name
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relrowsecurity = true
  AND NOT EXISTS (
    SELECT 1 FROM pg_policy p
    WHERE p.polrelid = c.oid
  )
ORDER BY c.relname;

/* C) Tables with RLS DISABLED that typically have RLS in this project (manual review) */
WITH expected_rls_tables AS (
  SELECT unnest(ARRAY[
    'activity_log', 'admin_notifications', 'application_field_mappings',
    'application_fill_events', 'application_outcomes', 'application_reminders',
    'application_runs', 'application_status_history', 'applications',
    'ats_events', 'audit_log', 'board_discoveries', 'calibration_curves',
    'candidate_activity', 'candidate_hidden_jobs', 'candidate_job_matches',
    'candidate_resumes', 'candidate_saved_jobs', 'candidate_subscriptions',
    'candidate_usage', 'candidates', 'companies', 'company_analytics',
    'company_invitations', 'company_usage', 'consent_records',
    'conversation_participants', 'conversations', 'cron_run_history',
    'data_deletion_requests', 'data_retention_policies', 'email_activity',
    'events', 'follow_up_reminders', 'gmail_connections',
    'human_review_requests', 'ingest_connectors', 'jobs', 'messages',
    'platform_metrics', 'pricing_plans', 'profiles',
    'recruiter_candidate_assignments', 'recruiter_performance',
    'resume_artifacts', 'resume_embeddings', 'resume_versions', 'run_steps',
    'scoring_runs', 'scrape_runs', 'success_fee_agreements', 'success_fee_events',
    'user_feature_flags', 'user_presence'
  ]) AS table_name
),
tables_with_rls AS (
  SELECT c.relname AS table_name
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = true
),
existing_tables AS (
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
)
SELECT e.table_name
FROM expected_rls_tables e
JOIN existing_tables x ON x.table_name = e.table_name
WHERE NOT EXISTS (SELECT 1 FROM tables_with_rls r WHERE r.table_name = e.table_name)
ORDER BY e.table_name;

/* D) Public schema functions WITHOUT search_path set (linter 0011) */
SELECT p.proname AS function_name,
       pg_get_function_identity_arguments(p.oid) AS arguments
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND (p.proconfig IS NULL OR NOT (
    EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c = 'search_path=public')
    OR EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%')
  ))
ORDER BY p.proname;

/* E) Summary: RLS status per table (all public base tables) */
SELECT
  t.table_name,
  CASE WHEN c.relrowsecurity THEN 'RLS on' ELSE 'RLS off' END AS rls_status,
  (SELECT count(*)::int FROM pg_policy pol WHERE pol.polrelid = c.oid) AS policy_count
FROM information_schema.tables t
JOIN pg_class c ON c.relname = t.table_name
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = t.table_schema
WHERE t.table_schema = 'public'
  AND t.table_type = 'BASE TABLE'
  AND t.table_name NOT LIKE 'pg_%'
ORDER BY t.table_name;

/* F) Expected unique constraints / indexes (032) presence check */
SELECT 'jobs_source_source_job_id_uidx' AS name, (SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'jobs_source_source_job_id_uidx' LIMIT 1) AS found
UNION ALL
SELECT 'ingest_jobs_provider_source_org_source_job_id_key', (SELECT conname FROM pg_constraint WHERE conrelid = 'public.ingest_jobs'::regclass AND conname = 'ingest_jobs_provider_source_org_source_job_id_key' LIMIT 1)
UNION ALL
SELECT 'candidate_job_matches_candidate_id_job_id_key', (SELECT conname FROM pg_constraint WHERE conrelid = 'public.candidate_job_matches'::regclass AND conname = 'candidate_job_matches_candidate_id_job_id_key' LIMIT 1)
UNION ALL
SELECT 'application_field_mappings_upsert_uidx', (SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'application_field_mappings_upsert_uidx' LIMIT 1);

/* G) Role vs effective_role mismatch (should be empty after 050 trigger / one-time fix)
   Rows where effective_role would not match what the app derives from role. */
SELECT id, email, role AS current_role, effective_role AS current_effective_role,
  CASE role
    WHEN 'admin' THEN 'platform_admin'
    WHEN 'recruiter' THEN COALESCE(NULLIF(effective_role, 'company_admin'), 'recruiter')
    WHEN 'candidate' THEN 'candidate'
    ELSE 'candidate'
  END AS expected_effective_role
FROM public.profiles
WHERE (role = 'admin'     AND effective_role IS DISTINCT FROM 'platform_admin')
   OR (role = 'recruiter' AND effective_role IS NOT NULL AND effective_role NOT IN ('recruiter', 'company_admin'))
   OR (role = 'candidate' AND effective_role IS DISTINCT FROM 'candidate')
ORDER BY email;

/* H) Profile vs candidate name/email desync (same user, different name or email) */
SELECT p.id AS profile_id, p.email AS profile_email, p.name AS profile_name,
       c.id AS candidate_id, c.email AS candidate_email, c.full_name AS candidate_full_name
FROM public.profiles p
JOIN public.candidates c ON c.user_id = p.id
WHERE p.name IS DISTINCT FROM c.full_name
   OR NULLIF(TRIM(p.email), '') IS DISTINCT FROM NULLIF(TRIM(c.email), '')
ORDER BY p.email;
