-- 038_subscription_tier.sql
-- Subscription tiers and Stripe billing

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_customer_id text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_tier text NOT NULL DEFAULT 'free'
  CHECK (subscription_tier IN ('free', 'pro', 'enterprise'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'inactive'
  CHECK (subscription_status IN ('inactive', 'active', 'past_due', 'canceled'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_period_end timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_subscription_id text;

CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer ON profiles(stripe_customer_id);
