-- 065_rls_hardening.sql
-- Tighten application_notes ownership checks to enforce candidate/application linkage.

ALTER TABLE public.application_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "application_notes_own" ON public.application_notes;

CREATE POLICY "application_notes_candidate_owner" ON public.application_notes
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.candidates c
      JOIN public.applications a ON a.candidate_id = c.id
      WHERE c.user_id = auth.uid()
        AND c.id = application_notes.candidate_id
        AND a.id = application_notes.application_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.candidates c
      JOIN public.applications a ON a.candidate_id = c.id
      WHERE c.user_id = auth.uid()
        AND c.id = application_notes.candidate_id
        AND a.id = application_notes.application_id
    )
  );
