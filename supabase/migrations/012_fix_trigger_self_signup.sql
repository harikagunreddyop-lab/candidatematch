-- Fix: self-signup users who match orphan candidate rows should be visible
-- immediately (invite_accepted_at = now()), not hidden (NULL).
-- Only invited users (invited_at IS NOT NULL) should start hidden.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Backfill: any self-signup users currently stuck with invite_accepted_at = NULL
-- whose auth.users row has invited_at IS NULL (i.e. they were NOT invited).
UPDATE public.candidates c
SET invite_accepted_at = c.created_at
FROM auth.users u
WHERE c.user_id = u.id
  AND c.invite_accepted_at IS NULL
  AND u.invited_at IS NULL;
