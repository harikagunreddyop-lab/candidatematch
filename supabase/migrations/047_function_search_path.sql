-- Fix linter: set search_path on functions (Function Search Path Mutable)
-- See: https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable

-- 1. Functions we define here (full CREATE OR REPLACE with SET search_path)
CREATE OR REPLACE FUNCTION public.get_effective_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    effective_role,
    CASE role WHEN 'admin' THEN 'platform_admin' WHEN 'recruiter' THEN 'recruiter' ELSE 'candidate' END
  ) FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_user_company()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid()
    AND (role = 'admin' OR effective_role = 'platform_admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_company_admin_or_above()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid()
    AND (role = 'admin' OR effective_role IN ('platform_admin', 'company_admin'))
  );
$$;

CREATE OR REPLACE FUNCTION public.can_access_company(target_company_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_admin()
  OR public.get_user_company() = target_company_id;
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1), ''),
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'candidate')
  )
  ON CONFLICT (id) DO NOTHING;

  UPDATE public.candidates
  SET user_id = NEW.id,
      invite_accepted_at = CASE
        WHEN NEW.invited_at IS NOT NULL THEN NULL
        ELSE now()
      END
  WHERE email = NEW.email
    AND user_id IS NULL
    AND id = (
      SELECT id FROM public.candidates
      WHERE email = NEW.email AND user_id IS NULL
      ORDER BY active DESC, updated_at DESC
      LIMIT 1
    );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- 2. Any other public functions from the linter list: set search_path via dynamic ALTER
DO $$
DECLARE
  r RECORD;
  funcs TEXT[] := ARRAY[
    'is_conversation_participant', 'is_assigned_recruiter', 'my_candidate_id',
    'sync_candidate_to_profile', 'sync_profile_to_candidate', 'notify_admin_onboarding_complete',
    'update_conversation_timestamp', 'add_admins_to_conversation', 'generate_job_hash',
    'calculate_fit_score', 'get_user_role'
  ];
  fname TEXT;
BEGIN
  FOREACH fname IN ARRAY funcs
  LOOP
    FOR r IN (
      SELECT p.oid, n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public' AND p.proname = fname
    )
    LOOP
      EXECUTE format(
        'ALTER FUNCTION public.%I(%s) SET search_path = public',
        r.proname,
        r.args
      );
    END LOOP;
  END LOOP;
END $$;
