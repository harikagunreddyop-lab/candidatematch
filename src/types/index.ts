// ============================================================================
// Orion CMOS — Type Definitions
// ============================================================================

export type Role = 'admin' | 'recruiter' | 'candidate';

export interface Profile {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
  /** When true, recruiter can use AI resume generation (admin-granted). */
  resume_generation_allowed?: boolean;
}

export interface Experience {
  company: string;
  title: string;
  start_date: string;
  end_date: string;
  current: boolean;
  responsibilities: string[];
  location?: string;
}

export interface Education {
  institution: string;
  degree: string;
  field: string;
  graduation_date: string;
  gpa?: string;
}

export interface Certification {
  name: string;
  issuer: string;
  date: string;
  expiry?: string;
}

export interface Candidate {
  id: string;
  full_name: string;
  email?: string;
  phone?: string;
  location?: string;
  visa_status?: string;
  primary_title: string;
  secondary_titles: string[];
  target_job_titles?: string[];
  skills: string[];
  tools?: string[];
  soft_skills?: string[];
  tags?: string[];
  experience: Experience[];
  education: Education[];
  certifications: Certification[];
  summary?: string;
  linkedin_url?: string;
  portfolio_url?: string;
  github_url?: string;
  active: boolean;
  user_id?: string;
  default_pitch?: string;
  parsed_resume_text?: string;
  years_of_experience?: number;
  last_seen_matches_at?: string;
  created_at: string;
  updated_at: string;
}

export interface Job {
  id: string;
  source: string;
  source_job_id?: string;
  title: string;
  company: string;
  location?: string;
  url?: string;
  jd_raw?: string;
  jd_clean?: string;
  salary_min?: number;
  salary_max?: number;
  job_type?: string;
  remote_type?: string;
  dedupe_hash: string;
  is_active: boolean;
  scraped_at: string;
  expires_at?: string;
  created_at: string;
  structured_requirements?: any;
  must_have_skills?: string[];
  nice_to_have_skills?: string[];
  seniority_level?: string;
  min_years_experience?: number;
  weighted_keywords?: Record<string, number>;
  structure_hash?: string;
}

export interface VariantScore {
  resume_id: string | null;
  score: number;
  reason: string;
}

export interface MatchScoreBreakdown {
  variant_scores?: VariantScore[];
  profile_only?: boolean;
  candidate_domains?: string[];
  job_domain?: string;
  profile?: {
    skill_score?: number;
    title_score?: number;
    experience_score?: number;
    location_score?: number;
    resume_signal_score?: number;
    matched_skills?: string[];
  };
}

export interface CandidateJobMatch {
  id: string;
  candidate_id: string;
  job_id: string;
  fit_score: number;
  matched_keywords: string[];
  missing_keywords: string[];
  match_reason?: string;
  matched_at: string;
  score_breakdown?: MatchScoreBreakdown;
  best_resume_id?: string;
  /** On-demand ATS check (computed only when recruiter/admin runs it for a job). */
  ats_score?: number | null;
  ats_reason?: string | null;
  ats_breakdown?: any;
  ats_checked_at?: string | null;
  ats_resume_id?: string | null;
  job?: Job;
  candidate?: Candidate;
}

export interface ResumeVersion {
  id: string;
  candidate_id: string;
  job_id: string;
  pdf_path: string;
  bullets: BulletGroup[];
  generation_status: 'pending' | 'generating' | 'compiling' | 'uploading' | 'completed' | 'failed';
  error_message?: string;
  version_number: number;
  created_at: string;
  job?: Job;
}

export interface BulletGroup {
  company: string;
  title: string;
  bullets: string[];
}

export type ApplicationStatus =
  | 'ready'
  | 'applied'
  | 'screening'
  | 'interview'
  | 'offer'
  | 'rejected'
  | 'withdrawn';

export interface OfferDetails {
  salary?: number;
  bonus?: number;
  equity?: string;
  start_date?: string;
  notes?: string;
  accepted?: boolean | null; // null = pending decision
}

export interface Application {
  id: string;
  candidate_id: string;
  job_id: string;
  resume_version_id?: string;
  candidate_resume_id?: string; // which uploaded resume candidate used
  status: ApplicationStatus;
  applied_at?: string;
  notes?: string;               // recruiter notes
  candidate_notes?: string;     // candidate private note
  interview_date?: string;
  interview_notes?: string;    // candidate interview prep note
  offer_details?: OfferDetails;
  created_at: string;
  updated_at: string;
  job?: Job;
  candidate?: Candidate;
  resume_version?: ResumeVersion;
}

export interface CandidateSavedJob {
  candidate_id: string;
  job_id: string;
  created_at: string;
}

export interface ApplicationReminder {
  id: string;
  application_id: string;
  candidate_id: string;
  remind_at: string;
  created_at: string;
}

export interface ScrapeRun {
  id: string;
  actor_id: string;
  search_query: string;
  status: 'running' | 'completed' | 'failed';
  jobs_found: number;
  jobs_new: number;
  jobs_duplicate: number;
  started_at: string;
  completed_at?: string;
  error_message?: string;
}

// API types
export interface ResumeGenerationRequest {
  candidate_id: string;
  job_id: string;
}

export interface ResumeGenerationResponse {
  resume_version_id: string;
  status: string;
  pdf_path?: string;
}

export interface ScrapeRequest {
  search_queries: string[];
  sources: ('linkedin' | 'indeed')[];
  max_results_per_query?: number;
}

export interface MatchRunRequest {
  candidate_id?: string;
}

export interface DashboardStats {
  total_candidates: number;
  total_jobs: number;
  total_applications: number;
  total_resumes: number;
  recent_applications: Application[];
  top_matches: CandidateJobMatch[];
}

// Report types
export interface RecruiterStat {
  recruiter_id: string;
  name: string;
  email: string;
  candidates_assigned: number;
  applications_submitted: number;
  interviews_secured: number;
  offers_received: number;
  interview_rate: number;
  offer_rate: number;
  avg_days_to_interview: number | null;
  efficiency_score: number;
}

export interface StuckCandidate {
  candidate_id: string;
  candidate_name: string;
  job_title: string;
  company: string;
  status: ApplicationStatus;
  days_stuck: number;
  recruiter_name: string;
  application_id: string;
}

export interface RoleIntelligence {
  title_family: string;
  total_applications: number;
  screening_count: number;
  interview_count: number;
  offer_count: number;
  screening_rate: number;
  interview_rate: number;
  offer_rate: number;
}