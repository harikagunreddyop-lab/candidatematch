-- ============================================================================
-- 024_gmail_integration.sql
--
-- Gmail OAuth connection + email activity tracking for recruiters.
-- Allows automatic email tracking without manual entry.
-- ============================================================================

-- Gmail OAuth connections (one per user; recruiters/admins)
CREATE TABLE IF NOT EXISTS public.gmail_connections (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email         TEXT        NOT NULL,
  access_token  TEXT        NOT NULL,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  scope         TEXT,
  connected_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_sync_at  TIMESTAMPTZ,
  UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_gmail_connections_user
  ON public.gmail_connections (user_id);

-- Synced email activity — links emails to candidates/applications when matched
CREATE TABLE IF NOT EXISTS public.email_activity (
  id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  connection_id  UUID        NOT NULL REFERENCES public.gmail_connections(id) ON DELETE CASCADE,
  gmail_message_id TEXT      NOT NULL,
  gmail_thread_id  TEXT      NOT NULL,
  from_email     TEXT        NOT NULL,
  to_emails      TEXT[]      DEFAULT '{}',
  subject        TEXT,
  snippet        TEXT,
  received_at    TIMESTAMPTZ NOT NULL,
  -- Matched by from_email → candidate email (for recruiter's assigned candidates)
  candidate_id   UUID        REFERENCES public.candidates(id) ON DELETE SET NULL,
  application_id UUID        REFERENCES public.applications(id) ON DELETE SET NULL,
  synced_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (connection_id, gmail_message_id)
);

CREATE INDEX IF NOT EXISTS idx_email_activity_connection
  ON public.email_activity (connection_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_activity_candidate
  ON public.email_activity (candidate_id) WHERE candidate_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_activity_application
  ON public.email_activity (application_id) WHERE application_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_activity_from
  ON public.email_activity (from_email, connection_id);

-- RLS
ALTER TABLE public.gmail_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_activity ENABLE ROW LEVEL SECURITY;

-- Users can only see their own connection
CREATE POLICY gmail_connections_user ON public.gmail_connections
  FOR ALL USING (auth.uid() = user_id);

-- Users can only see email activity for their own connection
CREATE POLICY email_activity_via_connection ON public.email_activity
  FOR ALL USING (
    connection_id IN (SELECT id FROM public.gmail_connections WHERE user_id = auth.uid())
  );

COMMENT ON TABLE public.gmail_connections IS 'Gmail OAuth tokens for recruiters/admins. Used to sync email for candidate tracking.';
COMMENT ON TABLE public.email_activity IS 'Synced Gmail messages, optionally linked to candidates/applications when from_email matches.';
