-- =============================================================================
-- 050_sync_role_effective_role.sql — Keep role and effective_role in sync
-- Prevents data mismatch: when profiles.role is updated, effective_role is
-- set so profile_roles view and RLS always see a consistent effective role.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.sync_role_to_effective_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    NEW.effective_role := CASE NEW.role
      WHEN 'admin'     THEN 'platform_admin'
      WHEN 'recruiter' THEN CASE WHEN OLD.effective_role = 'company_admin' THEN 'company_admin' ELSE 'recruiter' END
      WHEN 'candidate' THEN 'candidate'
      ELSE COALESCE(NEW.effective_role, 'candidate')
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_role_to_effective_role_trigger ON public.profiles;
CREATE TRIGGER sync_role_to_effective_role_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_role_to_effective_role();

COMMENT ON FUNCTION public.sync_role_to_effective_role() IS 'Keeps effective_role in sync with role on update; preserves company_admin when role is recruiter.';
