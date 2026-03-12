-- ATS Engine v3 migration
-- Adds job_requirements_cache table and new ats columns on candidate_job_matches

-- Cache extracted job requirements (one AI call per job, reused for all candidates)
create table if not exists job_requirements_cache (
  job_id        uuid primary key references jobs(id) on delete cascade,
  requirements_json jsonb not null,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- New ATS columns on matches
alter table candidate_job_matches
  add column if not exists ats_score       integer,
  add column if not exists ats_band        text,
  add column if not exists ats_gate_passed boolean,
  add column if not exists ats_breakdown   jsonb,
  add column if not exists ats_checked_at  timestamptz;

-- Index for recruiter dashboard queries (filter by band/gate)
create index if not exists idx_matches_ats_score on candidate_job_matches(ats_score desc) where ats_score is not null;
create index if not exists idx_matches_ats_band  on candidate_job_matches(ats_band)       where ats_band is not null;

