# Frontend Code Cleanup — Validation

This doc records the frontend cleanup (removal of test data, placeholders, and console usage) and how to keep the codebase clean.

## Validation Checklist

- **No `console.log` in production app code** — Removed all `console.log`/`console.warn` from `src/app/**/*.tsx`. `console.error` remains only in error-boundary style code (`dashboard/layout.tsx`, `dashboard/error.tsx`) for intentional error logging.
- **No commented-out code blocks** — Section comments like `{/* Main grid */}` are kept; no dead commented-out JSX or logic.
- **No placeholder text** — No "Lorem ipsum", "Coming soon", or "Under construction" in app pages. Input `placeholder` attributes (e.g. "Search…") are valid UI and kept.
- **No mock/demo data** — No `mockJobs`, `demoUsers`, or similar arrays in app TSX.
- **TODOs as issues** — No TODOs were found in `src/app/**/*.tsx` during cleanup. New TODOs should be tracked as GitHub issues; add a link in the comment if needed.
- **Clean ESLint** — One warning in `dashboard/candidate/profile/page.tsx` (useCallback deps) was resolved with an intentional `eslint-disable-next-line` and comment.

## What Was Done

1. **Console usage**
   - Removed `console.warn` from `auth/reset-password/page.tsx` (code exchange); UI already shows error state.
   - Removed `console.error` from admin/company/recruiter candidate pages and admin jobs/messages where user-visible error state (e.g. `setResumeError`, `setMatchMsg`, `setCreateError`) already surfaces the error.
   - Kept `console.error` in `dashboard/layout.tsx` and `dashboard/error.tsx` for error-boundary logging.

2. **ESLint**
   - Fixed `react-hooks/exhaustive-deps` in `src/app/dashboard/candidate/profile/page.tsx` with a documented disable.

3. **Placeholders / mock data / TODOs**
   - No mock arrays, Lorem ipsum, or TODO comments were found in app TSX during the cleanup pass.

## Maintaining Clean State

- Run `npm run lint` (or your ESLint command) before committing.
- Prefer user-visible error state (toast, inline message) over `console.error` in UI code; reserve `console.error` for error boundaries or critical failures where logging is required.
- Track follow-up work as GitHub issues and reference them in code with `// See issue #NNN` if needed.

## RLS Launch Verification Checklist

Run these queries before launch and archive outputs in release evidence:

```sql
WITH target(table_name) AS (
  VALUES
    ('resume_ats_checks'),
    ('application_notes'), ('application_communications'),
    ('job_templates'), ('job_postings_external'), ('job_performance_metrics'), ('scheduled_job_postings'),
    ('pipeline_stages'), ('candidate_pipeline_history'), ('ai_candidate_scores'), ('talent_pools'), ('talent_pool_members'),
    ('team_permissions'), ('recruiter_period_metrics'), ('team_goals'), ('candidate_notes'), ('team_tasks'),
    ('email_accounts'), ('email_messages'), ('email_tracking_links'), ('email_templates'), ('email_sequences'), ('scheduled_emails'),
    ('candidate_resumes'), ('applications'), ('application_reminders'), ('jobs'), ('profiles')
)
SELECT
  t.table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced,
  COUNT(p.policyname) AS policy_count
FROM target t
JOIN pg_class c ON c.relname = t.table_name
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
LEFT JOIN pg_policies p ON p.schemaname = 'public' AND p.tablename = t.table_name
GROUP BY t.table_name, c.relrowsecurity, c.relforcerowsecurity
ORDER BY t.table_name;
```

```sql
SELECT schemaname, tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND (qual ILIKE '%true%' OR with_check ILIKE '%true%')
ORDER BY tablename, policyname;
```

```sql
SELECT tablename, policyname, cmd, permissive, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'resume_ats_checks','application_notes','application_communications',
    'job_templates','job_postings_external','job_performance_metrics','scheduled_job_postings',
    'pipeline_stages','candidate_pipeline_history','ai_candidate_scores','talent_pools','talent_pool_members',
    'team_permissions','recruiter_period_metrics','team_goals','candidate_notes','team_tasks',
    'email_accounts','email_messages','email_tracking_links','email_templates','email_sequences','scheduled_emails',
    'candidate_resumes','applications','application_reminders','jobs','profiles'
  )
ORDER BY tablename, policyname;
```

Required simulation checks:
- Candidate A cannot read/write Candidate B data.
- Company X cannot read/write Company Y data.
- Non-admin company user cannot edit team permissions/goals/tasks outside assigned scope.
- Non-public jobs are not readable by unrelated users.
- `application_notes` writes must match both candidate ownership and linked application ownership.
