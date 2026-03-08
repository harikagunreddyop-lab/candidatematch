-- ============================================================================
-- 043_pricing_tiers.sql — Tiered pricing (Free / Pro / Pro Plus) and usage tracking
-- ============================================================================

-- Pricing plans (reference data)
CREATE TABLE IF NOT EXISTS public.pricing_plans (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL UNIQUE,
  display_name        TEXT NOT NULL,
  price_monthly_cents  INTEGER NOT NULL,
  features            JSONB NOT NULL DEFAULT '[]'::jsonb,
  limits              JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.pricing_plans IS 'Candidate plan definitions: free, pro, pro_plus';

INSERT INTO public.pricing_plans (name, display_name, price_monthly_cents, features, limits)
VALUES
  (
    'free',
    'Free',
    0,
    '["job_search", "basic_profile", "5_applications"]'::jsonb,
    '{"applications_per_month": 5, "resume_generations": 1, "job_alerts": 0}'::jsonb
  ),
  (
    'pro',
    'Pro',
    2900,
    '["unlimited_applications", "ai_resume", "email_tracking", "job_alerts", "ats_scoring"]'::jsonb,
    '{"applications_per_month": -1, "resume_generations": 50, "job_alerts": 10}'::jsonb
  ),
  (
    'pro_plus',
    'Pro Plus',
    9900,
    '["all_pro_features", "priority_matching", "analytics_dashboard", "career_coaching", "interview_prep"]'::jsonb,
    '{"applications_per_month": -1, "resume_generations": -1, "job_alerts": -1, "priority_support": true}'::jsonb
  )
ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  price_monthly_cents = EXCLUDED.price_monthly_cents,
  features = EXCLUDED.features,
  limits = EXCLUDED.limits;

-- Candidate subscriptions (one active per candidate; history can be added later)
CREATE TABLE IF NOT EXISTS public.candidate_subscriptions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id            UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  plan_name               TEXT NOT NULL,
  status                  TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'canceled', 'past_due', 'trialing')),
  stripe_subscription_id  TEXT,
  current_period_start    TIMESTAMPTZ,
  current_period_end      TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (candidate_id)
);

CREATE INDEX IF NOT EXISTS idx_candidate_subscriptions_candidate
  ON public.candidate_subscriptions (candidate_id);
CREATE INDEX IF NOT EXISTS idx_candidate_subscriptions_stripe
  ON public.candidate_subscriptions (stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;

COMMENT ON TABLE public.candidate_subscriptions IS 'Current subscription per candidate; synced from Stripe webhooks.';

-- Usage tracking per billing period (monthly)
CREATE TABLE IF NOT EXISTS public.candidate_usage (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id            UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  period_start            DATE NOT NULL,
  period_end              DATE NOT NULL,
  applications_used       INTEGER NOT NULL DEFAULT 0,
  resume_generations_used INTEGER NOT NULL DEFAULT 0,
  job_alerts_used         INTEGER NOT NULL DEFAULT 0,
  UNIQUE (candidate_id, period_start)
);

CREATE INDEX IF NOT EXISTS idx_candidate_usage_candidate_period
  ON public.candidate_usage (candidate_id, period_start);

COMMENT ON TABLE public.candidate_usage IS 'Usage counters per candidate per billing period for limit enforcement.';

-- RLS
ALTER TABLE public.pricing_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pricing_plans_read_all" ON public.pricing_plans FOR SELECT USING (true);

CREATE POLICY "candidate_subscriptions_own" ON public.candidate_subscriptions
  FOR ALL USING (
    candidate_id IN (SELECT id FROM public.candidates WHERE user_id = auth.uid())
  );

CREATE POLICY "candidate_usage_own" ON public.candidate_usage
  FOR ALL USING (
    candidate_id IN (SELECT id FROM public.candidates WHERE user_id = auth.uid())
  );

-- Service role can manage all (for webhooks and feature gates server-side)
CREATE POLICY "candidate_subscriptions_service" ON public.candidate_subscriptions
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "candidate_usage_service" ON public.candidate_usage
  FOR ALL USING (auth.role() = 'service_role');

-- Allow profiles to store pro_plus tier (extend 038 check)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_subscription_tier_check'
    AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles DROP CONSTRAINT profiles_subscription_tier_check;
  END IF;
  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_subscription_tier_check
    CHECK (subscription_tier IN ('free', 'pro', 'pro_plus', 'enterprise'));
EXCEPTION
  WHEN others THEN
    NULL;
END $$;

-- RPC: increment usage for a feature in the current period
CREATE OR REPLACE FUNCTION public.increment_candidate_usage(
  p_candidate_id UUID,
  p_feature TEXT,
  p_period_start DATE,
  p_period_end DATE
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_feature = 'applications' THEN
    INSERT INTO public.candidate_usage (candidate_id, period_start, period_end, applications_used)
    VALUES (p_candidate_id, p_period_start, p_period_end, 1)
    ON CONFLICT (candidate_id, period_start)
    DO UPDATE SET applications_used = public.candidate_usage.applications_used + 1;
  ELSIF p_feature = 'resume_generations' THEN
    INSERT INTO public.candidate_usage (candidate_id, period_start, period_end, resume_generations_used)
    VALUES (p_candidate_id, p_period_start, p_period_end, 1)
    ON CONFLICT (candidate_id, period_start)
    DO UPDATE SET resume_generations_used = public.candidate_usage.resume_generations_used + 1;
  ELSIF p_feature = 'job_alerts' THEN
    INSERT INTO public.candidate_usage (candidate_id, period_start, period_end, job_alerts_used)
    VALUES (p_candidate_id, p_period_start, p_period_end, 1)
    ON CONFLICT (candidate_id, period_start)
    DO UPDATE SET job_alerts_used = public.candidate_usage.job_alerts_used + 1;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.increment_candidate_usage IS 'Increment usage counter for applications, resume_generations, or job_alerts.';
