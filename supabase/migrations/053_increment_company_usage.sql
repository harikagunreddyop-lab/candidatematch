-- RPC for feature gates: increment company_usage counters (e.g. candidates_viewed this month).
CREATE OR REPLACE FUNCTION public.increment_company_usage(
  p_company_id UUID,
  p_usage_month DATE,
  p_metric TEXT DEFAULT 'candidates_viewed'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_start DATE := date_trunc('month', p_usage_month)::date;
  v_period_end   DATE := v_period_start + interval '1 month' - interval '1 day';
BEGIN
  IF p_metric = 'candidates_viewed' THEN
    INSERT INTO public.company_usage (company_id, usage_month, candidates_viewed)
    VALUES (p_company_id, v_period_start, 1)
    ON CONFLICT (company_id, usage_month)
    DO UPDATE SET candidates_viewed = public.company_usage.candidates_viewed + 1;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.increment_company_usage IS 'Increment company_usage metric for the given month; used by feature gates.';
