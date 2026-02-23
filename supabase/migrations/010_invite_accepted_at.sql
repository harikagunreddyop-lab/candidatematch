-- ============================================================================
-- invite_accepted_at: Candidate only appears on candidates page after they
-- set their password (accept the invitation). Password creation = acceptance.
-- ============================================================================

ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS invite_accepted_at TIMESTAMPTZ;

COMMENT ON COLUMN public.candidates.invite_accepted_at IS 'When the candidate set their password (accepted the invite). NULL = invited but not yet accepted.';

-- Backfill: existing candidates are treated as accepted
UPDATE public.candidates
SET invite_accepted_at = COALESCE(invite_accepted_at, created_at)
WHERE invite_accepted_at IS NULL;
