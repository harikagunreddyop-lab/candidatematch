-- =============================================================================
-- 051_backfill_effective_role.sql — One-time: set effective_role where NULL or
-- mismatched so audit G returns no rows. Optional: sync profile name → candidate
-- full_name where they differ (audit H). Safe to run multiple times.
-- =============================================================================

UPDATE public.profiles
SET effective_role = CASE role
  WHEN 'admin'     THEN 'platform_admin'
  WHEN 'recruiter' THEN COALESCE(NULLIF(effective_role, 'company_admin'), 'recruiter')
  WHEN 'candidate' THEN 'candidate'
  ELSE COALESCE(effective_role, 'candidate')
END
WHERE effective_role IS NULL
   OR (role = 'admin'     AND effective_role IS DISTINCT FROM 'platform_admin')
   OR (role = 'recruiter' AND (effective_role IS NULL OR effective_role NOT IN ('recruiter', 'company_admin')))
   OR (role = 'candidate' AND effective_role IS DISTINCT FROM 'candidate');

/* One-time: sync candidate full_name from profile name where they differ (audit H) */
UPDATE public.candidates c
SET full_name = p.name, updated_at = now()
FROM public.profiles p
WHERE c.user_id = p.id
  AND p.name IS NOT NULL
  AND TRIM(p.name) <> ''
  AND c.full_name IS DISTINCT FROM p.name;
