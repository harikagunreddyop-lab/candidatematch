-- Fix RLS warnings: add WITH CHECK to follow_up_reminders candidate policy (if already applied without it)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'follow_up_reminders' AND policyname = 'follow_up_reminders_candidate_own') THEN
    DROP POLICY "follow_up_reminders_candidate_own" ON public.follow_up_reminders;
    CREATE POLICY "follow_up_reminders_candidate_own" ON public.follow_up_reminders
      FOR ALL
      USING (candidate_id IN (SELECT id FROM public.candidates WHERE user_id = auth.uid()))
      WITH CHECK (candidate_id IN (SELECT id FROM public.candidates WHERE user_id = auth.uid()));
  END IF;
END $$;
