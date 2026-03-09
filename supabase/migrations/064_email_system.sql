-- ============================================================================
-- 064_email_system.sql — Email accounts, messages, templates, sequences, scheduling, tracking
-- ADDITIVE. Builds on gmail_connections (024) and companies (039).
-- ============================================================================

-- email_accounts: linked email accounts (Gmail OAuth, etc.) — can extend gmail_connections or be standalone
CREATE TABLE IF NOT EXISTS public.email_accounts (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_address     TEXT NOT NULL,
  provider          TEXT CHECK (provider IN ('gmail', 'outlook', 'smtp')),
  access_token      TEXT,
  refresh_token     TEXT,
  token_expires_at  TIMESTAMPTZ,
  is_primary        BOOLEAN NOT NULL DEFAULT false,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  signature_html    TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, email_address)
);

CREATE INDEX IF NOT EXISTS idx_email_accounts_user ON public.email_accounts (user_id);
CREATE INDEX IF NOT EXISTS idx_email_accounts_active ON public.email_accounts (user_id, is_active) WHERE is_active = true;

-- email_messages: sent/received messages with optional tracking
CREATE TABLE IF NOT EXISTS public.email_messages (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email_account_id      UUID NOT NULL REFERENCES public.email_accounts(id) ON DELETE CASCADE,
  message_id            TEXT,
  thread_id             TEXT,
  direction             TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  from_email            TEXT NOT NULL,
  to_email              TEXT[] NOT NULL,
  cc_email              TEXT[] DEFAULT '{}',
  subject               TEXT,
  body_text             TEXT,
  body_html             TEXT,
  sent_at               TIMESTAMPTZ,
  opened_at             TIMESTAMPTZ,
  clicked_at            TIMESTAMPTZ,
  replied_at            TIMESTAMPTZ,
  tracking_id           TEXT UNIQUE,
  related_candidate_id  UUID REFERENCES public.candidates(id) ON DELETE SET NULL,
  related_application_id UUID REFERENCES public.applications(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_messages_account ON public.email_messages (email_account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_messages_tracking ON public.email_messages (tracking_id) WHERE tracking_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_messages_candidate ON public.email_messages (related_candidate_id) WHERE related_candidate_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_messages_application ON public.email_messages (related_application_id) WHERE related_application_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_messages_thread ON public.email_messages (email_account_id, thread_id) WHERE thread_id IS NOT NULL;

-- email_tracking_links: for click tracking (tracking_id + link_id -> redirect url)
CREATE TABLE IF NOT EXISTS public.email_tracking_links (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id  UUID NOT NULL REFERENCES public.email_messages(id) ON DELETE CASCADE,
  link_key    TEXT NOT NULL,
  original_url TEXT NOT NULL,
  clicked_at   TIMESTAMPTZ,
  UNIQUE (message_id, link_key)
);

CREATE INDEX IF NOT EXISTS idx_email_tracking_links_message ON public.email_tracking_links (message_id);

-- email_templates: company-scoped templates with variable placeholders
CREATE TABLE IF NOT EXISTS public.email_templates (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  template_name   TEXT NOT NULL,
  subject_template TEXT NOT NULL,
  body_template   TEXT NOT NULL,
  template_type   TEXT,
  variables       JSONB DEFAULT '[]',
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_templates_company ON public.email_templates (company_id, is_active);

-- email_sequences: automation sequences (trigger + steps)
CREATE TABLE IF NOT EXISTS public.email_sequences (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id    UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  sequence_name TEXT NOT NULL,
  trigger_event TEXT NOT NULL,
  steps         JSONB NOT NULL DEFAULT '[]',
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_sequences_company ON public.email_sequences (company_id, is_active);

-- scheduled_emails: queue for delayed send and sequence steps
CREATE TABLE IF NOT EXISTS public.scheduled_emails (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  email_account_id UUID NOT NULL REFERENCES public.email_accounts(id) ON DELETE CASCADE,
  template_id     UUID REFERENCES public.email_templates(id) ON DELETE SET NULL,
  sequence_id     UUID REFERENCES public.email_sequences(id) ON DELETE SET NULL,
  sequence_step   INT,
  to_email        TEXT[] NOT NULL,
  cc_email        TEXT[] DEFAULT '{}',
  subject         TEXT NOT NULL,
  body_html       TEXT NOT NULL,
  body_text       TEXT,
  related_candidate_id  UUID REFERENCES public.candidates(id) ON DELETE SET NULL,
  related_application_id UUID REFERENCES public.applications(id) ON DELETE SET NULL,
  tracking_enabled BOOLEAN NOT NULL DEFAULT true,
  send_at         TIMESTAMPTZ NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  sent_at         TIMESTAMPTZ,
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_emails_send_at ON public.scheduled_emails (send_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_scheduled_emails_account ON public.scheduled_emails (email_account_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_emails_application ON public.scheduled_emails (related_application_id) WHERE related_application_id IS NOT NULL;

-- RLS
ALTER TABLE public.email_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_tracking_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_emails ENABLE ROW LEVEL SECURITY;

-- email_accounts: user owns their accounts
CREATE POLICY email_accounts_user ON public.email_accounts
  FOR ALL USING (auth.uid() = user_id);

-- email_messages: via account ownership
CREATE POLICY email_messages_via_account ON public.email_messages
  FOR ALL USING (
    email_account_id IN (SELECT id FROM public.email_accounts WHERE user_id = auth.uid())
  );

-- email_tracking_links: via message -> account
CREATE POLICY email_tracking_links_via_message ON public.email_tracking_links
  FOR ALL USING (
    message_id IN (
      SELECT id FROM public.email_messages
      WHERE email_account_id IN (SELECT id FROM public.email_accounts WHERE user_id = auth.uid())
    )
  );

-- email_templates: company members (recruiters/admins) can manage
CREATE POLICY email_templates_company ON public.email_templates
  FOR ALL USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND company_id IS NOT NULL)
  );

-- email_sequences: company members
CREATE POLICY email_sequences_company ON public.email_sequences
  FOR ALL USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND company_id IS NOT NULL)
  );

-- scheduled_emails: account owner or company
CREATE POLICY scheduled_emails_owner ON public.scheduled_emails
  FOR ALL USING (
    email_account_id IN (SELECT id FROM public.email_accounts WHERE user_id = auth.uid())
    OR company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND company_id IS NOT NULL)
  );

COMMENT ON TABLE public.email_accounts IS 'Connected email accounts (Gmail OAuth, etc.) for send/receive and tracking';
COMMENT ON TABLE public.email_messages IS 'Sent and received emails with optional open/click tracking';
COMMENT ON TABLE public.email_tracking_links IS 'Click tracking: link_key + message_id -> original URL';
COMMENT ON TABLE public.email_templates IS 'Company email templates with variable placeholders';
COMMENT ON TABLE public.email_sequences IS 'Automated email sequences (e.g. application follow-up)';
COMMENT ON TABLE public.scheduled_emails IS 'Queue for scheduled and sequence emails';
