# Database schema and table relations

Ways to get the full schema and relations for this project.

## 1. Run the schema SQL script (recommended)

From the repo root:

```bash
# If you have connection string in .env (e.g. SUPABASE_DB_URL or DATABASE_URL)
psql "$DATABASE_URL" -f supabase/scripts/schema-and-relations.sql
```

Or in **Supabase Dashboard**:

1. Open your project → **SQL Editor**.
2. Copy the contents of `supabase/scripts/schema-and-relations.sql`.
3. Run it. You get:
   - **Query 1**: All tables and columns (public schema).
   - **Query 2**: All foreign keys (from_table/from_column → to_table/to_column) with delete/update rules.
   - **Query 3**: One row per table with a summary of its foreign keys.

## 2. Supabase Dashboard

- **Table Editor**: Lists tables; clicking a table shows columns and suggested relations.
- **Database** → **Tables**: Schema and relationships are visible in the UI.

## 3. Schema-only dump (PostgreSQL)

Full DDL (tables, indexes, FKs, triggers, etc.) without data:

```bash
# Local Supabase (default DB URL)
pg_dump -h 127.0.0.1 -p 54322 -U postgres -d postgres --schema-only --schema=public -f schema.sql

# Remote (use connection string from Supabase project settings)
pg_dump "postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres" --schema-only --schema=public -f schema.sql
```

## 4. From migrations (source of truth in code)

The applied schema is defined by migrations in order:

```
supabase/migrations/
  001_initial.sql    # Core tables (profiles, candidates, jobs, applications, candidate_job_matches, …)
  002_*.sql … 049_db_audit_fixes.sql, 050_sync_role_effective_role.sql
```

To see what will be applied (without connecting to DB):

```bash
ls -la supabase/migrations/
```

To reset and re-apply locally:

```bash
npx supabase db reset
```

## 5. Quick relations overview (key tables)

**Note:** The compact summary (query 3) only lists tables that have *at least one* outgoing foreign key. Tables that are only *referenced* by others (e.g. `ingest_jobs`, `ingest_connectors`, `board_discoveries`, `gmail_connections`, `talent_nodes`) appear in the detailed FK list (query 2) as `to_table`. Use query 0 for all table names and query 4 for tables with no outgoing FKs.

**Delete rules:** In the detailed FK output, `delete_rule` = CASCADE means deleting the parent row deletes the child rows; SET NULL means the child column is set to NULL; NO ACTION means the DB blocks the delete if children exist (unless another rule applies).

**Query 1 (columns):** Now restricted to base tables only. Views (e.g. `profile_roles`, `recruiter_candidate_matches`, `shadow_score_divergence`, `ai_cost_monthly`) are excluded from the column list; use query 0 to see all table names and run `\d+ view_name` in psql or Table Editor for view definitions.

**Query 4 (tables with no FKs):** Typically returns tables that are only referenced by others, e.g. `admin_notifications`, `board_discoveries`, `calibration_curves`, `cron_run_history`, `feature_flags`, `ingest_connectors`, `ingest_jobs`, `market_skill_trends`, `platform_metrics`, `pricing_plans`, `scrape_runs`, `system_metrics`, `talent_nodes`.

| Table | Main relations |
|-------|----------------|
| `profiles` | Referenced by: candidates, recruiter_candidate_assignments, applications (indirect), jobs (posted_by) |
| `candidates` | → profiles; referenced by: applications, candidate_job_matches, resume_versions, recruiter_candidate_assignments |
| `jobs` | Referenced by: applications, candidate_job_matches, resume_versions; → ingest_jobs (ingest_job_id) |
| `applications` | → candidates, jobs |
| `candidate_job_matches` | → candidates, jobs |
| `ingest_jobs` | Referenced by jobs (ingest_job_id) |
| `ingest_connectors` | Referenced by ingest_jobs (provider/source_org) |

For the full, up-to-date list, run `supabase/scripts/schema-and-relations.sql` against your database.

## 6. Database audit (health check)

To verify the database is set up correctly (PKs, RLS, policies, function `search_path`), run the audit script:

```bash
psql "$DATABASE_URL" -f supabase/scripts/db-audit.sql
```

Or in **Supabase Dashboard** → **SQL Editor**, paste and run `supabase/scripts/db-audit.sql`.

**What each result set means:**

| Result | Meaning |
|--------|--------|
| **A) Base tables without PK** | Should be empty. Any row = table missing primary key (fix in a migration). |
| **B) RLS on but zero policies** | Should be empty. Any row = table has RLS but no policies (no one can access); add policies per the migration that enabled RLS. |
| **C) Expected RLS tables with RLS off** | Lists tables that usually have RLS in this project but currently don't. Review; enable RLS and add policies per the relevant migration if needed. |
| **D) Functions without search_path** | Lists `public` functions that don't have `search_path = public` (Supabase linter 0011). |
| **E) RLS status per table** | Summary: each public base table, RLS on/off, policy count. |
| **F) Expected constraints/indexes** | Checks that key unique constraints/indexes from migration 032 exist. |
| **G) Role vs effective_role mismatch** | Profiles where `effective_role` does not match `role` (e.g. role=candidate but effective_role=recruiter). Run migration 050 to prevent; use this to find existing rows to fix. |
| **H) Profile vs candidate name/email desync** | Rows where the same user has different name or email in `profiles` vs `candidates`. Fix by syncing in admin Edit User or accept-invite flow. |

**Applying fixes:**

- **Function search_path:** Run migration `049_db_audit_fixes.sql` (idempotent). It sets `search_path = public` on any `public` function that lacks it.
- **Role / effective_role sync:** Run migration `050_sync_role_effective_role.sql`. It adds a trigger so that whenever `profiles.role` is updated, `profiles.effective_role` is set consistently (and `company_admin` is preserved when role is recruiter). The admin Users page also sets `effective_role` when saving the Edit User modal. If audit **G** returns rows, fix them with `UPDATE profiles SET effective_role = CASE role WHEN 'admin' THEN 'platform_admin' WHEN 'recruiter' THEN COALESCE(NULLIF(effective_role, 'company_admin'), 'recruiter') WHEN 'candidate' THEN 'candidate' ELSE 'candidate' END WHERE ...` for those ids, or run a one-time bulk fix.
- **Profile vs candidate desync (H):** Fix in Admin → Users → Edit user (name/email are synced to the candidate row when saving).
- **PK / RLS / policies:** Fix in new migrations or by re-running the specific migration that defines them. Do not enable RLS without adding at least one policy (otherwise the table is inaccessible).
- **Reset and re-apply all migrations (local only):** `npx supabase db reset`
