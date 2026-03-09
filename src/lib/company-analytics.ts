/**
 * Company hiring analytics: funnel, time-to-hire, cost-per-hire, quality, metrics.
 * Used by /api/company/analytics/* and dashboard. All queries scoped by company_id.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export interface DateRange {
  startDate: string;
  endDate: string;
}

export interface FunnelData {
  stage: string;
  count: number;
  percentage: number;
  drop_rate?: number;
}

export async function getHiringFunnel(
  supabase: SupabaseClient,
  companyId: string,
  dateRange: DateRange
): Promise<FunnelData[]> {
  const { data: jobs } = await supabase.from('jobs').select('id').eq('company_id', companyId);
  const jobIds = (jobs ?? []).map((j: { id: string }) => j.id);
  if (jobIds.length === 0) {
    return [
      { stage: 'Applications', count: 0, percentage: 0, drop_rate: 0 },
      { stage: 'Screening', count: 0, percentage: 0, drop_rate: 0 },
      { stage: 'Interview', count: 0, percentage: 0, drop_rate: 0 },
      { stage: 'Offer', count: 0, percentage: 0, drop_rate: 0 },
      { stage: 'Hired', count: 0, percentage: 0, drop_rate: 0 },
    ];
  }

  const { data: apps } = await supabase
    .from('applications')
    .select('id, status, offer_details, created_at')
    .in('job_id', jobIds)
    .gte('created_at', `${dateRange.startDate}T00:00:00.000Z`)
    .lte('created_at', `${dateRange.endDate}T23:59:59.999Z`);

  const list = apps ?? [];
  const applications = list.length;
  const screening = list.filter((a) => a.status === 'screening').length;
  const interview = list.filter((a) => a.status === 'interview').length;
  const offer = list.filter((a) => a.status === 'offer').length;
  const hired = list.filter(
    (a) => a.status === 'offer' && (a.offer_details as Record<string, unknown>)?.accepted === true
  ).length;

  return [
    { stage: 'Applications', count: applications, percentage: applications ? 100 : 0, drop_rate: 0 },
    {
      stage: 'Screening',
      count: screening,
      percentage: applications ? (screening / applications) * 100 : 0,
      drop_rate: applications ? ((applications - screening) / applications) * 100 : 0,
    },
    {
      stage: 'Interview',
      count: interview,
      percentage: applications ? (interview / applications) * 100 : 0,
      drop_rate: screening ? ((screening - interview) / screening) * 100 : 0,
    },
    {
      stage: 'Offer',
      count: offer,
      percentage: applications ? (offer / applications) * 100 : 0,
      drop_rate: interview ? ((interview - offer) / interview) * 100 : 0,
    },
    {
      stage: 'Hired',
      count: hired,
      percentage: applications ? (hired / applications) * 100 : 0,
      drop_rate: offer ? ((offer - hired) / offer) * 100 : 0,
    },
  ];
}

export interface TimeToHireMetrics {
  avg_days: number;
  median_days: number;
  by_role: { role: string; avg_days: number; count: number }[];
  by_department: { department: string; avg_days: number; count: number }[];
  trend: { date: string; avg_days: number; count: number }[];
}

export async function getTimeToHire(
  supabase: SupabaseClient,
  companyId: string,
  dateRange: DateRange
): Promise<TimeToHireMetrics> {
  const { data: jobs } = await supabase
    .from('jobs')
    .select('id, title, department')
    .eq('company_id', companyId);
  const jobIds = (jobs ?? []).map((j: { id: string }) => j.id);
  const jobMap = new Map(
    (jobs ?? []).map((j: { id: string; title?: string; department?: string }) => [j.id, j])
  );
  if (jobIds.length === 0) {
    return { avg_days: 0, median_days: 0, by_role: [], by_department: [], trend: [] };
  }

  const { data: hired } = await supabase
    .from('applications')
    .select('id, job_id, created_at, updated_at, offer_details')
    .in('job_id', jobIds)
    .eq('status', 'offer')
    .gte('created_at', `${dateRange.startDate}T00:00:00.000Z`)
    .lte('created_at', `${dateRange.endDate}T23:59:59.999Z`);

  const accepted: typeof hired = [];
  for (const a of hired ?? []) {
    const od = a.offer_details as Record<string, unknown> | null;
    if (od?.accepted === true) accepted.push(a);
  }

  const daysList: number[] = [];
  const byRole: Record<string, { total: number; count: number }> = {};
  const byDept: Record<string, { total: number; count: number }> = {};
  const byWeek: Record<string, { total: number; count: number }> = {};

  for (const a of accepted) {
    const created = new Date(a.created_at).getTime();
    const updated = new Date(a.updated_at).getTime();
    const days = Math.round((updated - created) / (24 * 60 * 60 * 1000));
    daysList.push(days);
    const job = jobMap.get(a.job_id);
    const role = job?.title ?? 'Unknown';
    const dept = job?.department ?? 'Other';
    byRole[role] = byRole[role] ?? { total: 0, count: 0 };
    byRole[role].total += days;
    byRole[role].count += 1;
    byDept[dept] = byDept[dept] ?? { total: 0, count: 0 };
    byDept[dept].total += days;
    byDept[dept].count += 1;
    const weekKey = a.updated_at.slice(0, 10);
    byWeek[weekKey] = byWeek[weekKey] ?? { total: 0, count: 0 };
    byWeek[weekKey].total += days;
    byWeek[weekKey].count += 1;
  }

  const avg_days = daysList.length ? daysList.reduce((a, b) => a + b, 0) / daysList.length : 0;
  const sorted = [...daysList].sort((a, b) => a - b);
  const median_days = sorted.length ? sorted[Math.floor(sorted.length / 2)]! : 0;

  return {
    avg_days,
    median_days,
    by_role: Object.entries(byRole).map(([role, v]) => ({
      role,
      avg_days: v.count ? v.total / v.count : 0,
      count: v.count,
    })),
    by_department: Object.entries(byDept).map(([department, v]) => ({
      department,
      avg_days: v.count ? v.total / v.count : 0,
      count: v.count,
    })),
    trend: Object.entries(byWeek)
      .map(([date, v]) => ({ date, avg_days: v.count ? v.total / v.count : 0, count: v.count }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}

export interface CostPerHireBreakdown {
  total_cost_cents: number;
  total_hires: number;
  cost_per_hire_cents: number;
  breakdown_by_type: { type: string; amount_cents: number; percentage: number }[];
  trend: { month: string; cost_per_hire_cents: number; hires: number }[];
}

export async function getCostPerHire(
  supabase: SupabaseClient,
  companyId: string,
  startDate: string,
  endDate: string
): Promise<CostPerHireBreakdown> {
  const { data: costs } = await supabase
    .from('hiring_costs')
    .select('cost_type, amount_cents, incurred_at')
    .eq('company_id', companyId)
    .gte('incurred_at', startDate)
    .lte('incurred_at', endDate);

  const byType: Record<string, number> = {};
  const byMonth: Record<string, number> = {};
  let totalCost = 0;
  for (const c of costs ?? []) {
    const t = c.cost_type ?? 'other';
    byType[t] = (byType[t] ?? 0) + (c.amount_cents ?? 0);
    totalCost += c.amount_cents ?? 0;
    const month = (c.incurred_at as string).slice(0, 7);
    byMonth[month] = (byMonth[month] ?? 0) + (c.amount_cents ?? 0);
  }

  const { data: jobs } = await supabase.from('jobs').select('id').eq('company_id', companyId);
  const jobIds = (jobs ?? []).map((j: { id: string }) => j.id);
  let totalHires = 0;
  const hiresByMonth: Record<string, number> = {};
  if (jobIds.length > 0) {
    const { data: hiredApps } = await supabase
      .from('applications')
      .select('id, updated_at, offer_details')
      .in('job_id', jobIds)
      .eq('status', 'offer')
      .gte('updated_at', `${startDate}T00:00:00.000Z`)
      .lte('updated_at', `${endDate}T23:59:59.999Z`);
    for (const a of hiredApps ?? []) {
      if ((a.offer_details as Record<string, unknown>)?.accepted === true) {
        totalHires += 1;
        const month = a.updated_at.slice(0, 7);
        hiresByMonth[month] = (hiresByMonth[month] ?? 0) + 1;
      }
    }
  }

  const cost_per_hire_cents = totalHires > 0 ? Math.round(totalCost / totalHires) : 0;
  const breakdown_by_type = Object.entries(byType).map(([type, amount_cents]) => ({
    type,
    amount_cents,
    percentage: totalCost > 0 ? (amount_cents / totalCost) * 100 : 0,
  }));

  const months = new Set([...Object.keys(byMonth), ...Object.keys(hiresByMonth)]);
  const trend = Array.from(months).map((month) => {
    const cost = byMonth[month] ?? 0;
    const hires = hiresByMonth[month] ?? 0;
    return {
      month,
      cost_per_hire_cents: hires > 0 ? Math.round(cost / hires) : 0,
      hires,
    };
  }).sort((a, b) => a.month.localeCompare(b.month));

  return {
    total_cost_cents: totalCost,
    total_hires: totalHires,
    cost_per_hire_cents,
    breakdown_by_type,
    trend,
  };
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

export async function getDashboardMetrics(
  supabase: SupabaseClient,
  companyId: string
): Promise<DashboardMetrics> {
  const { data: jobList } = await supabase.from('jobs').select('id').eq('company_id', companyId);
  const ids = (jobList ?? []).map((j: { id: string }) => j.id);

  let total_active_jobs = 0;
  let total_applications = 0;
  let applications_in_screening = 0;
  let applications_in_interview = 0;
  let offers_made = 0;
  let hires_completed = 0;

  const [activeRes, a, s, i, o, h, analyticsRes, qualityRes] = await Promise.all([
    supabase.from('jobs').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('is_active', true),
    ids.length ? supabase.from('applications').select('id', { count: 'exact', head: true }).in('job_id', ids) : Promise.resolve({ count: 0 }),
    ids.length ? supabase.from('applications').select('id', { count: 'exact', head: true }).in('job_id', ids).eq('status', 'screening') : Promise.resolve({ count: 0 }),
    ids.length ? supabase.from('applications').select('id', { count: 'exact', head: true }).in('job_id', ids).eq('status', 'interview') : Promise.resolve({ count: 0 }),
    ids.length ? supabase.from('applications').select('id', { count: 'exact', head: true }).in('job_id', ids).eq('status', 'offer') : Promise.resolve({ count: 0 }),
    ids.length ? supabase.from('applications').select('id', { count: 'exact', head: true }).in('job_id', ids).eq('status', 'offer').filter('offer_details->>accepted', 'eq', 'true') : Promise.resolve({ count: 0 }),
    supabase.from('company_analytics').select('avg_time_to_hire_days').eq('company_id', companyId).single(),
    supabase.from('hire_quality_evaluations').select('composite_score').eq('company_id', companyId),
  ]);

  total_active_jobs = activeRes.count ?? 0;
  total_applications = (a as { count?: number }).count ?? 0;
  applications_in_screening = (s as { count?: number }).count ?? 0;
  applications_in_interview = (i as { count?: number }).count ?? 0;
  offers_made = (o as { count?: number }).count ?? 0;
  hires_completed = (h as { count?: number }).count ?? 0;

  const qualityScores = (qualityRes.data ?? [])
    .map((r: { composite_score?: number }) => r.composite_score)
    .filter((n): n is number => typeof n === 'number');
  const avg_quality_of_hire_score =
    qualityScores.length > 0 ? qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length : null;

  return {
    total_active_jobs,
    total_applications,
    applications_in_screening,
    applications_in_interview,
    offers_made,
    hires_completed,
    avg_time_to_hire_days: analyticsRes.data?.avg_time_to_hire_days ?? null,
    avg_cost_per_hire_cents: null,
    avg_quality_of_hire_score,
  };
}

export function getPeriodRange(period: '7d' | '30d' | '90d'): DateRange {
  const end = new Date();
  const start = new Date();
  if (period === '7d') start.setDate(start.getDate() - 7);
  else if (period === '30d') start.setDate(start.getDate() - 30);
  else start.setDate(start.getDate() - 90);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}
