export interface FunnelData {
  stage: string;
  count: number;
  percentage: number;
  drop_rate?: number;
}

export interface TimeToHireMetrics {
  avg_days: number;
  median_days: number;
  by_role: { role: string; avg_days: number; count: number }[];
  by_department: { department: string; avg_days: number; count: number }[];
  trend: { date: string; avg_days: number; count: number }[];
}

export interface CostPerHireBreakdown {
  total_cost_cents: number;
  total_hires: number;
  cost_per_hire_cents: number;
  breakdown_by_type: { type: string; amount_cents: number; percentage: number }[];
  trend: { month: string; cost_per_hire_cents: number; hires: number }[];
}

export interface DashboardMetrics {
  total_active_jobs: number;
  total_applications: number;
  applications_in_screening: number;
  applications_in_interview: number;
  offers_made: number;
  hires_completed: number;
  avg_time_to_hire_days: number | null;
  avg_cost_per_hire_cents: number | null;
  avg_quality_of_hire_score: number | null;
}

export type DateRangePreset = '7d' | '30d' | '90d';
