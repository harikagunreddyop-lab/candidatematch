-- Allow recruiters and admins to read/write recruiter_candidate_assignments.
-- If RLS was enabled elsewhere, this ensures recruiters see their assignments.
ALTER TABLE public.recruiter_candidate_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recruiter_assignments_select_own" ON public.recruiter_candidate_assignments
  FOR SELECT USING (
    recruiter_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "recruiter_assignments_admin_all" ON public.recruiter_candidate_assignments
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "recruiter_assignments_insert" ON public.recruiter_candidate_assignments
  FOR INSERT WITH CHECK (
    recruiter_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "recruiter_assignments_delete_own" ON public.recruiter_candidate_assignments
  FOR DELETE USING (recruiter_id = auth.uid());
