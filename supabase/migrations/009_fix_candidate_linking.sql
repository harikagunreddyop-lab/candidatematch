-- ============================================================================
-- Fix: Auto-link existing candidate records when a user signs up/logs in
-- Problem: Admin creates candidate with email but no user_id. When user signs
-- up with that email, a new empty candidate is created instead of linking to
-- the existing one.
-- ============================================================================

-- Replace the handle_new_user trigger to also link orphaned candidates by email
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Create profile row (unchanged behavior)
  INSERT INTO public.profiles (id, name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1), ''),
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'candidate')
  )
  ON CONFLICT (id) DO NOTHING;

  -- Link orphaned candidate records that match this email but have no user_id
  -- Only link ONE candidate (the most recently active one) to avoid conflicts
  UPDATE public.candidates
  SET user_id = NEW.id
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
$$ LANGUAGE plpgsql SECURITY DEFINER;
