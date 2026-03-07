-- ============================================================================
-- Phase 1 verification queries — run in Supabase SQL Editor after applying 041
-- ============================================================================

-- 1) Required tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'companies',
    'profiles',
    'jobs',
    'candidate_job_matches',
    'candidates',
    'company_invitations',
    'activity_log',
    'candidate_activity',
    'company_analytics',
    'recruiter_performance',
    'platform_metrics',
    'success_fee_events',
    'success_fee_agreements',
    'company_usage'
  )
ORDER BY table_name;

-- 2) profile_roles view exists
SELECT table_name, table_type
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'profile_roles';

-- 3) Helper functions exist
SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'get_effective_role',
    'get_user_company',
    'is_platform_admin',
    'is_company_admin_or_above',
    'can_access_company',
    'update_updated_at_column'
  )
ORDER BY routine_name;

-- 4) Companies Phase 1 columns
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'companies'
  AND column_name IN ('trial_ends_at', 'settings', 'created_by', 'slug', 'size_range')
ORDER BY column_name;

-- 5) Jobs columns (company-scoped)
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'jobs'
  AND column_name IN ('company_id', 'posted_by', 'visibility', 'created_by')
ORDER BY column_name;

-- 6) activity_log structure
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'activity_log'
ORDER BY ordinal_position;

-- 7) RLS enabled on key tables
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('companies', 'jobs', 'company_invitations', 'activity_log', 'candidate_job_matches')
ORDER BY tablename;

-- 8) Jobs policies (after 041)
SELECT policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'jobs'
ORDER BY policyname;

-- 9) activity_log policies
SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'activity_log'
ORDER BY policyname;

-- Expected activity_log: platform_admin_all_activity_log (ALL), company_members_read_activity_log (SELECT), company_members_insert_activity_log (INSERT).

-- 10) Phase 1 RLS verified when 8 & 9 show expected policies.
-- ============================================================================
-- NEXT STEPS (after Phase 1 verification)
-- ============================================================================
-- 1. Optional: Run queries 1–7 above to confirm tables, view, functions, columns, RLS enabled.
-- 2. Phase 2 (per PHASE1_SIGNOFF): auth helpers and type safety.
-- 3. App: wire activity_log inserts (e.g. job_created on POST /api/companies/jobs, candidate_viewed on contact view).
