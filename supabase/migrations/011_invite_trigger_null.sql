-- When linking an orphan via invite, set invite_accepted_at = NULL so they don't
-- appear on the candidates page until they set their password (accept the invite).
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
  -- Set invite_accepted_at = NULL so they don't show until they set password
  UPDATE public.candidates
  SET user_id = NEW.id, invite_accepted_at = NULL
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
