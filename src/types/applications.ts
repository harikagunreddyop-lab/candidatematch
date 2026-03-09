/**
 * Application pipeline types for candidate dashboard.
 */

export const APPLICATION_STATUSES = [
  'ready',
  'applied',
  'screening',
  'interview',
  'offer',
  'rejected',
  'withdrawn',
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export interface ApplicationJob {
  id: string;
  title?: string | null;
  company?: string | null;
  location?: string | null;
  url?: string | null;
}

export interface Application {
  id: string;
  candidate_id: string;
  job_id: string;
  status: ApplicationStatus;
  applied_at: string | null;
  notes: string | null;
  interview_date: string | null;
  offer_details: unknown;
  next_action_required?: string | null;
  next_action_due?: string | null;
  withdrawal_reason?: string | null;
  candidate_notes?: string | null;
  interview_notes?: string | null;
  created_at: string;
  updated_at: string;
  job?: ApplicationJob | ApplicationJob[] | null;
  days_in_status?: number;
}

export function getApplicationJob(app: Application): ApplicationJob | null {
  const j = app.job;
  if (!j) return null;
  return Array.isArray(j) ? j[0] ?? null : j;
}

export function daysInStatus(updatedAt: string | null | undefined): number {
  if (!updatedAt) return 0;
  return Math.floor((Date.now() - new Date(updatedAt).getTime()) / (24 * 60 * 60 * 1000));
}
