-- Canonical job profiles (AI-extracted, cached per job)
CREATE TABLE IF NOT EXISTS job_canonical_profiles (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id                UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  title                 TEXT NOT NULL,
  family                TEXT NOT NULL,
  family_confidence     INTEGER NOT NULL DEFAULT 0,
  seniority             TEXT,
  domain_tags           JSONB NOT NULL DEFAULT '[]',
  industry_vertical     TEXT,
  requirements          JSONB NOT NULL DEFAULT '[]',
  responsibilities      JSONB NOT NULL DEFAULT '[]',
  min_years             INTEGER,
  preferred_years       INTEGER,
  required_education    TEXT,
  required_certifications JSONB NOT NULL DEFAULT '[]',
  location_type         TEXT,
  work_auth_required    BOOLEAN,
  raw_description       TEXT,
  extracted_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  model_used            TEXT NOT NULL DEFAULT 'claude-haiku',
  UNIQUE(job_id)
);

-- Canonical candidate profiles (deterministic, per resume)
CREATE TABLE IF NOT EXISTS candidate_canonical_profiles (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id            UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  resume_id               UUID REFERENCES candidate_resumes(id) ON DELETE SET NULL,
  inferred_family         TEXT NOT NULL DEFAULT 'general',
  family_confidence       INTEGER NOT NULL DEFAULT 0,
  inferred_seniority      TEXT,
  total_years_experience  NUMERIC(5,1) NOT NULL DEFAULT 0,
  total_roles             INTEGER NOT NULL DEFAULT 0,
  skill_evidence          JSONB NOT NULL DEFAULT '{}',
  experience_summary      JSONB NOT NULL DEFAULT '[]',
  education_summary       JSONB NOT NULL DEFAULT '[]',
  certifications          JSONB NOT NULL DEFAULT '[]',
  parse_quality           INTEGER NOT NULL DEFAULT 0,
  parse_warnings          JSONB NOT NULL DEFAULT '[]',
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

