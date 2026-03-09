-- Fix linter: replace SECURITY DEFINER views with security_invoker = on
-- so they run with the querying user's permissions (RLS applies correctly).
-- See: https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view

-- Ensure profiles has company_id before view that selects it
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;

-- 1. profile_roles (from 039)
DROP VIEW IF EXISTS public.profile_roles;
CREATE VIEW public.profile_roles WITH (security_invoker = on) AS
SELECT
  p.id,
  p.name,
  p.email,
  p.role         AS legacy_role,
  p.company_id,
  p.permissions,
  p.last_active_at,
  p.avatar_url,
  p.subscription_tier,
  p.subscription_status,
  p.is_active,
  p.created_at,
  p.updated_at,
  COALESCE(
    p.effective_role,
    CASE p.role
      WHEN 'admin'     THEN 'platform_admin'
      WHEN 'recruiter' THEN 'recruiter'
      WHEN 'candidate' THEN 'candidate'
      ELSE 'candidate'
    END
  ) AS effective_role
FROM public.profiles p;

-- 2. shadow_score_divergence (from 020)
DROP VIEW IF EXISTS public.shadow_score_divergence;
CREATE VIEW public.shadow_score_divergence WITH (security_invoker = on) AS
SELECT
  id                                          AS match_id,
  candidate_id,
  job_id,
  ats_score,
  shadow_ats_score,
  ABS(ats_score - shadow_ats_score)           AS divergence,
  ats_confidence,
  shadow_ats_confidence,
  scoring_profile
FROM public.candidate_job_matches
WHERE shadow_ats_score IS NOT NULL
  AND ats_score IS NOT NULL
ORDER BY divergence DESC;

COMMENT ON VIEW public.shadow_score_divergence
  IS 'QA view: shows score deltas between production engine and shadow engine. Alert if divergence > 15 for > 5% of rows.';
