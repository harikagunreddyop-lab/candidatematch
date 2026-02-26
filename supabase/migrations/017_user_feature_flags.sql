-- Per-user feature flag overrides
-- Admin can enable or disable individual features for any specific user,
-- overriding the role-level defaults in feature_flags.

CREATE TABLE IF NOT EXISTS public.user_feature_flags (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  key        TEXT NOT NULL,
  enabled    BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, key)
);

CREATE INDEX IF NOT EXISTS idx_user_feature_flags_user ON public.user_feature_flags(user_id);

ALTER TABLE public.user_feature_flags ENABLE ROW LEVEL SECURITY;

-- Only admins can read/write per-user flags
CREATE POLICY "user_feature_flags_admin_only" ON public.user_feature_flags
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Users can read their own flags
CREATE POLICY "user_feature_flags_self_read" ON public.user_feature_flags
  FOR SELECT USING (auth.uid() = user_id);
