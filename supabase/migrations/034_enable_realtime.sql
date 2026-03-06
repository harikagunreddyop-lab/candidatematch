-- 034_enable_realtime.sql
-- Enable Supabase Realtime for all tables that have frontend postgres_changes subscriptions.
-- Without this, all .on('postgres_changes', ...) calls silently receive zero events.

-- ─── 1. Add tables to the supabase_realtime publication ──────────────────────
-- Supabase creates an empty publication called "supabase_realtime" by default.
-- We drop and recreate it with all the tables we need.

DROP PUBLICATION IF EXISTS supabase_realtime;

CREATE PUBLICATION supabase_realtime FOR TABLE
  public.candidates,
  public.applications,
  public.candidate_job_matches,
  public.jobs,
  public.profiles,
  public.recruiter_candidate_assignments,
  public.resume_versions,
  public.candidate_resumes,
  public.candidate_saved_jobs,
  public.application_reminders,
  public.messages,
  public.conversations,
  public.conversation_participants,
  public.admin_notifications,
  public.feature_flags,
  public.user_feature_flags;

-- ─── 2. Set REPLICA IDENTITY FULL on tables with filtered subscriptions ──────
-- Filtered subscriptions (e.g. filter: 'candidate_id=eq.xxx') need the OLD row
-- values to be present in WAL for UPDATE/DELETE events. Without REPLICA IDENTITY
-- FULL, the filter comparison cannot match and events are silently dropped.

ALTER TABLE public.candidates REPLICA IDENTITY FULL;
ALTER TABLE public.applications REPLICA IDENTITY FULL;
ALTER TABLE public.candidate_job_matches REPLICA IDENTITY FULL;
ALTER TABLE public.recruiter_candidate_assignments REPLICA IDENTITY FULL;
ALTER TABLE public.resume_versions REPLICA IDENTITY FULL;
ALTER TABLE public.candidate_resumes REPLICA IDENTITY FULL;
ALTER TABLE public.candidate_saved_jobs REPLICA IDENTITY FULL;
ALTER TABLE public.application_reminders REPLICA IDENTITY FULL;
ALTER TABLE public.user_feature_flags REPLICA IDENTITY FULL;
