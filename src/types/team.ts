/**
 * Team management, permissions, performance, goals, notes, tasks.
 */

export type PermissionCategory = 'jobs' | 'candidates' | 'analytics' | 'settings' | 'billing';

export interface Permission {
  key: string;
  label: string;
  description: string;
  category: PermissionCategory;
}

export interface TeamPermissionRow {
  id: string;
  company_id: string;
  user_id: string;
  permission_key: string;
  granted: boolean;
  granted_by: string | null;
  granted_at: string;
}

export interface RecruiterMetricsRow {
  id: string;
  recruiter_id: string;
  company_id: string;
  metric_period: string;
  period_start: string;
  period_end: string;
  candidates_contacted: number;
  applications_submitted: number;
  interviews_scheduled: number;
  offers_extended: number;
  hires_completed: number;
  response_rate: number | null;
  interview_conversion_rate: number | null;
  offer_acceptance_rate: number | null;
  avg_time_to_interview_days: number | null;
  quality_score: number | null;
  created_at: string;
}

export interface TeamGoalRow {
  id: string;
  company_id: string;
  assignee_id: string | null;
  goal_type: string;
  target_value: number;
  current_value: number;
  period_start: string;
  period_end: string;
  status: 'in_progress' | 'achieved' | 'missed';
  created_by: string | null;
  created_at: string;
}

export interface CandidateNoteRow {
  id: string;
  candidate_id: string;
  author_id: string | null;
  company_id: string;
  note_text: string;
  note_type: 'screening' | 'interview' | 'general' | null;
  is_private: boolean;
  mentioned_users: string[];
  created_at: string;
  updated_at: string;
}

export interface TeamTaskRow {
  id: string;
  company_id: string;
  title: string;
  description: string | null;
  assignee_id: string | null;
  related_candidate_id: string | null;
  related_job_id: string | null;
  due_date: string | null;
  priority: 'low' | 'medium' | 'high' | 'urgent' | null;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  created_by: string | null;
  completed_at: string | null;
  created_at: string;
}

export const AVAILABLE_PERMISSIONS: Permission[] = [
  { key: 'jobs.view_all', label: 'View All Jobs', description: 'See all company jobs', category: 'jobs' },
  { key: 'jobs.view_assigned', label: 'View Assigned Jobs', description: 'Only see jobs assigned to user', category: 'jobs' },
  { key: 'jobs.create', label: 'Create Jobs', description: 'Post new job openings', category: 'jobs' },
  { key: 'jobs.edit', label: 'Edit Jobs', description: 'Modify job postings', category: 'jobs' },
  { key: 'jobs.delete', label: 'Delete Jobs', description: 'Remove job postings', category: 'jobs' },
  { key: 'candidates.view_all', label: 'View All Candidates', description: 'Access entire candidate database', category: 'candidates' },
  { key: 'candidates.view_assigned', label: 'View Assigned Candidates', description: 'Only see assigned candidates', category: 'candidates' },
  { key: 'candidates.edit', label: 'Edit Candidates', description: 'Modify candidate profiles', category: 'candidates' },
  { key: 'candidates.export', label: 'Export Candidates', description: 'Download candidate data', category: 'candidates' },
  { key: 'analytics.view_company', label: 'View Company Analytics', description: 'See company-wide metrics', category: 'analytics' },
  { key: 'analytics.view_team', label: 'View Team Analytics', description: 'See team performance', category: 'analytics' },
  { key: 'analytics.export', label: 'Export Reports', description: 'Download analytics reports', category: 'analytics' },
  { key: 'settings.manage_team', label: 'Manage Team', description: 'Invite/remove team members', category: 'settings' },
  { key: 'settings.view_billing', label: 'View Billing', description: 'See subscription details', category: 'settings' },
  { key: 'settings.manage_billing', label: 'Manage Billing', description: 'Update payment methods', category: 'billing' },
];
