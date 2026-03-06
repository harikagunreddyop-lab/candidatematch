-- 037_onboarding_completed.sql
-- Add onboarding_completed flag for self-service candidates

ALTER TABLE candidates ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS onboarding_step int NOT NULL DEFAULT 0;
