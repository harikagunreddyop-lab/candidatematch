-- One-off: clear all jobs (use only when intended; cascades to matches, applications, etc.)
-- Run via: Supabase SQL Editor, or: npx supabase db execute -f supabase/migrations/048_clear_all_jobs.sql

DELETE FROM public.jobs;
