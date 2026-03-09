/**
 * Recruiter dashboard: daily tasks, follow-ups, goals, quick actions.
 */

export type DailyTaskType =
  | 'follow_up'
  | 'screen_resume'
  | 'schedule_interview'
  | 'send_offer'
  | 'update_status';

export interface DailyTask {
  id: string;
  type: DailyTaskType;
  title: string;
  description: string;
  related_candidate_id?: string;
  related_candidate_name?: string;
  related_job_id?: string;
  related_job_title?: string;
  related_application_id?: string;
  priority_score: number;
  estimated_time_minutes: number;
  due_date?: string;
  ai_reasoning?: string;
  completed_at?: string | null;
}

export interface FollowUpRecommendation {
  candidate_id: string;
  candidate_name: string;
  last_contact: string;
  days_since_contact: number;
  context: string;
  recommended_action: 'email' | 'call' | 'linkedin_message';
  suggested_message?: string;
  urgency: 'low' | 'medium' | 'high';
  success_probability?: number;
  application_id?: string;
  job_title?: string;
}

export interface RecruiterGoals {
  weekly_goals: {
    applications: { target: number; current: number };
    interviews: { target: number; current: number };
    offers: { target: number; current: number };
  };
  monthly_goals: {
    hires: { target: number; current: number };
    quality_score: { target: number; current: number };
  };
  progress_this_week: number;
  on_track: boolean;
  motivational_message?: string;
}

export interface QuickActionCounts {
  unreviewed_applications: number;
  interviews_to_schedule: number;
  follow_ups_due: number;
  pending_offers: number;
}

export interface UpcomingInterview {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  candidate_name: string;
  job_title: string;
  interview_type?: string;
  application_id?: string;
  candidate_id: string;
  job_id: string;
}

export interface ActivityTimelineItem {
  id: string;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  user_name?: string | null;
}

export interface LeaderboardPosition {
  rank: number;
  total_recruiters: number;
  period: string;
  period_start: string;
  period_end: string;
  score: number;
  metrics: { hires: number; offers: number; interviews: number; applications: number };
  badges: string[];
}
