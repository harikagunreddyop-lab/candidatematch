-- 058_application_management.sql
-- Application pipeline: next actions, notes, communications, reminders extension.

-- Applications: next action and withdrawal tracking
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS next_action_required TEXT,
  ADD COLUMN IF NOT EXISTS next_action_due TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS withdrawal_reason TEXT;

COMMENT ON COLUMN public.applications.next_action_required IS 'e.g. Schedule interview, Send thank you';
COMMENT ON COLUMN public.applications.next_action_due IS 'When the next action is due';
COMMENT ON COLUMN public.applications.withdrawal_reason IS 'Candidate reason when status = withdrawn';

-- application_notes: per-application notes (private, interview_prep, research)
CREATE TABLE IF NOT EXISTS public.application_notes (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  candidate_id   UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  note_type      TEXT CHECK (note_type IS NULL OR note_type IN ('private', 'interview_prep', 'research', 'custom')),
  content        TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_application_notes_application ON public.application_notes(application_id);
CREATE INDEX IF NOT EXISTS idx_application_notes_candidate ON public.application_notes(candidate_id);

ALTER TABLE public.application_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "application_notes_own" ON public.application_notes
  FOR ALL USING (
    candidate_id IN (SELECT id FROM public.candidates WHERE user_id = auth.uid())
  );

-- application_communications: log emails, messages, calls
CREATE TABLE IF NOT EXISTS public.application_communications (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id  UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  direction       TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  channel         TEXT CHECK (channel IS NULL OR channel IN ('email', 'phone', 'message', 'other')),
  subject         TEXT,
  content         TEXT,
  communicated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_application_communications_application ON public.application_communications(application_id);

ALTER TABLE public.application_communications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "application_communications_candidate" ON public.application_communications
  FOR SELECT USING (   
    application_id IN (
      SELECT a.id FROM public.applications a
      JOIN public.candidates c ON c.id = a.candidate_id AND c.user_id = auth.uid()
    )
  );

-- Candidates can log outbound communications for their applications
CREATE POLICY "application_communications_candidate_insert" ON public.application_communications
  FOR INSERT WITH CHECK (
    application_id IN (
      SELECT a.id FROM public.applications a
      JOIN public.candidates c ON c.id = a.candidate_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "application_communications_insert_service" ON public.application_communications
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- Extend application_reminders with type, message, is_sent
ALTER TABLE public.application_reminders
  ADD COLUMN IF NOT EXISTS reminder_type TEXT,
  ADD COLUMN IF NOT EXISTS message TEXT,
  ADD COLUMN IF NOT EXISTS is_sent BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.application_reminders.reminder_type IS 'follow_up, interview_prep, thank_you, decision_deadline, etc.';
COMMENT ON COLUMN public.application_reminders.message IS 'Reminder text shown to user';
COMMENT ON COLUMN public.application_reminders.is_sent IS 'Whether notification was sent (email/in-app)';
