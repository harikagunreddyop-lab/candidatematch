-- ============================================================================
-- RLS for ingest_connectors and board_discoveries (admin read for Job Boards UI)
-- Service role bypasses RLS; discovery/ingest APIs use service role.
-- ============================================================================

ALTER TABLE public.ingest_connectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_discoveries ENABLE ROW LEVEL SECURITY;

-- Admin can read connectors and discoveries (Job Boards admin UI)
CREATE POLICY "ingest_connectors_admin_read" ON public.ingest_connectors
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "board_discoveries_admin_read" ON public.board_discoveries
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );
