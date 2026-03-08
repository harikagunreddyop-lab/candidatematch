-- =============================================================================
-- Full DB schema and table relations (run in Supabase SQL Editor or psql)
-- =============================================================================
-- Usage: Copy and run in Supabase Dashboard → SQL Editor, or:
--   psql $DATABASE_URL -f supabase/scripts/schema-and-relations.sql
-- =============================================================================

-- 0) All tables in public schema (including tables with no foreign keys)
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
  AND table_name NOT LIKE 'pg_%'
ORDER BY table_name;

-- 1) All base tables and columns (public schema; excludes views like profile_roles, shadow_score_divergence)
SELECT
  c.table_schema,
  c.table_name,
  c.ordinal_position AS col_pos,
  c.column_name,
  c.data_type,
  c.udt_name,
  c.is_nullable,
  c.column_default
FROM information_schema.columns c
JOIN information_schema.tables t
  ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
WHERE c.table_schema = 'public'
  AND c.table_name NOT LIKE 'pg_%'
ORDER BY c.table_schema, c.table_name, c.ordinal_position;

-- 2) Foreign key relations (who references whom)
SELECT
  tc.constraint_schema,
  tc.table_name       AS from_table,
  kcu.column_name     AS from_column,
  ccu.table_schema    AS to_schema,
  ccu.table_name      AS to_table,
  ccu.column_name     AS to_column,
  rc.delete_rule,
  rc.update_rule
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema   = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema   = tc.table_schema
JOIN information_schema.referential_constraints rc
  ON tc.constraint_name = rc.constraint_name
  AND tc.table_schema   = rc.constraint_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
ORDER BY tc.table_name, kcu.ordinal_position;

-- 3) Compact summary: table → list of FKs (one row per table)
SELECT
  tc.table_name AS table_name,
  string_agg(
    kcu.column_name || ' → ' || ccu.table_name || '(' || ccu.column_name || ')',
    ', ' ORDER BY kcu.ordinal_position
  ) AS foreign_keys
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
GROUP BY tc.table_name
ORDER BY tc.table_name;

-- 4) Tables that are only referenced (have no outgoing FKs) — e.g. ingest_jobs, ingest_connectors, board_discoveries, gmail_connections, talent_nodes
SELECT t.table_name
FROM information_schema.tables t
WHERE t.table_schema = 'public'
  AND t.table_type = 'BASE TABLE'
  AND t.table_name NOT LIKE 'pg_%'
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    WHERE tc.table_schema = t.table_schema
      AND tc.table_name = t.table_name
      AND tc.constraint_type = 'FOREIGN KEY'
  )
ORDER BY t.table_name;
