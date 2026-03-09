-- 054_candidate_profile_intelligent.sql
-- Add fields for intelligent profile: completion %, strength score, video intro, portfolio, privacy, LinkedIn sync.

ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS profile_completion_percentage DECIMAL(5,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS profile_strength_score INTEGER DEFAULT NULL CHECK (profile_strength_score IS NULL OR (profile_strength_score >= 0 AND profile_strength_score <= 100)),
  ADD COLUMN IF NOT EXISTS video_intro_url TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS portfolio_items JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS privacy_settings JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS linkedin_sync_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS linkedin_last_synced_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN public.candidates.profile_completion_percentage IS '0-100, computed from filled required/optional fields';
COMMENT ON COLUMN public.candidates.profile_strength_score IS '0-100, AI/ATS-oriented profile strength';
COMMENT ON COLUMN public.candidates.video_intro_url IS 'URL to 60s max video introduction (e.g. Supabase Storage)';
COMMENT ON COLUMN public.candidates.portfolio_items IS 'Array of { title, url, description, image_url?, skills? }';
COMMENT ON COLUMN public.candidates.privacy_settings IS 'What to show recruiters: e.g. { show_email, show_phone, show_salary }';
COMMENT ON COLUMN public.candidates.linkedin_sync_enabled IS 'Whether to sync profile from LinkedIn';
COMMENT ON COLUMN public.candidates.linkedin_last_synced_at IS 'Last successful LinkedIn profile sync';
