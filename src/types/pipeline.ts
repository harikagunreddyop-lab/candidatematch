/**
 * Company pipeline and talent pool types.
 */

export type ApplicationStatusKey =
  | 'ready'
  | 'applied'
  | 'screening'
  | 'interview'
  | 'offer'
  | 'rejected'
  | 'withdrawn';

export interface AutoMoveRule {
  condition: string;
  action: 'move_to_stage' | 'send_email' | 'assign_recruiter';
  params: Record<string, unknown>;
}

export interface PipelineStage {
  id: string;
  company_id: string;
  stage_name: string;
  stage_order: number;
  stage_color: string | null;
  status_key: ApplicationStatusKey | null;
  auto_move_rules: AutoMoveRule[] | null;
  sla_hours: number | null;
  is_active: boolean;
  created_at: string;
}

export interface CandidatePipelineHistoryEntry {
  id: string;
  application_id: string;
  from_stage: string | null;
  to_stage: string;
  from_stage_id: string | null;
  to_stage_id: string | null;
  moved_by: string | null;
  moved_at: string;
  duration_in_previous_stage_hours: number | null;
  notes: string | null;
}

export interface AICandidateScore {
  id: string;
  candidate_id: string;
  job_id: string;
  overall_score: number | null;
  skill_match_score: number | null;
  experience_match_score: number | null;
  culture_fit_score: number | null;
  salary_alignment_score: number | null;
  likelihood_to_accept: number | null;
  reasoning: Record<string, unknown> | null;
  scored_at: string;
}

export interface TalentPool {
  id: string;
  company_id: string;
  pool_name: string;
  description: string | null;
  criteria: Record<string, unknown>;
  candidate_count: number;
  created_by: string | null;
  is_active: boolean;
  created_at: string;
}

export interface TalentPoolMember {
  pool_id: string;
  candidate_id: string;
  added_at: string;
  added_by: string | null;
}

export interface PipelineHealth {
  overall_score: number;
  stage_analysis: PipelineStageAnalysis[];
  predicted_time_to_fill_days: number | null;
  at_risk_applications: AtRiskApplication[];
}

export interface PipelineStageAnalysis {
  stage_id: string;
  stage_name: string;
  avg_time_in_stage_days: number;
  conversion_rate: number;
  bottleneck_severity: 'none' | 'minor' | 'major' | 'critical';
  recommendations: string[];
  count: number;
}

export interface AtRiskApplication {
  application_id: string;
  candidate_name: string;
  job_title: string;
  issue: string;
  stage_name: string;
}

export interface CandidateRankingRequest {
  job_id: string;
  candidates: string[];
  ranking_criteria?: {
    skills_weight?: number;
    experience_weight?: number;
    culture_fit_weight?: number;
    salary_weight?: number;
  };
}

export interface RankedCandidate {
  candidate_id: string;
  rank: number;
  score: number;
  strengths: string[];
  weaknesses: string[];
  recommendation: 'strong_hire' | 'maybe' | 'pass';
}
