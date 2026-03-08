-- Elite feature: follow-up reminders for applications
CREATE TABLE IF NOT EXISTS public.follow_up_reminders (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  candidate_id   UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  remind_at      TIMESTAMPTZ NOT NULL,
  note           TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_follow_up_reminders_candidate ON public.follow_up_reminders(candidate_id);
CREATE INDEX IF NOT EXISTS idx_follow_up_reminders_remind_at ON public.follow_up_reminders(remind_at);

ALTER TABLE public.follow_up_reminders ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'follow_up_reminders' AND policyname = 'follow_up_reminders_candidate_own') THEN
    CREATE POLICY "follow_up_reminders_candidate_own" ON public.follow_up_reminders
      FOR ALL
      USING (candidate_id IN (SELECT id FROM public.candidates WHERE user_id = auth.uid()))
      WITH CHECK (candidate_id IN (SELECT id FROM public.candidates WHERE user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'follow_up_reminders' AND policyname = 'follow_up_reminders_service') THEN
    CREATE POLICY "follow_up_reminders_service" ON public.follow_up_reminders
      FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

COMMENT ON TABLE public.follow_up_reminders IS 'Auto-follow-up reminders for candidate applications';
