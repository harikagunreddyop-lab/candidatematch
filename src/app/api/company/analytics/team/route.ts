/**
 * GET /api/company/analytics/team
 * Team (recruiter) performance overview for the company.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(req, {
    effectiveRoles: ['platform_admin', 'company_admin', 'recruiter'],
  });
  if (auth instanceof Response) return auth;

  const companyId = auth.profile.company_id;
  if (!companyId) {
    return NextResponse.json({ error: 'No company context' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: perf } = await supabase
    .from('recruiter_performance')
    .select('recruiter_id, total_candidates, total_applications, interviews_secured, offers_received, hires_completed, avg_time_to_interview, quality_score')
    .eq('company_id', companyId);

  const ids = (perf ?? []).map((p: { recruiter_id: string }) => p.recruiter_id);
  const { data: profiles } = await supabase
    .from('profile_roles')
    .select('id, name, email')
    .in('id', ids);

  type ProfileRow = { id: string; name: string | null; email: string | null };
  const profileMap = new Map<string, ProfileRow>(
    (profiles ?? []).map((p: ProfileRow) => [p.id, p])
  );
  type PerfRow = { recruiter_id: string; total_candidates: number; total_applications: number; interviews_secured: number; offers_received: number; hires_completed: number; avg_time_to_interview?: number | null; quality_score?: number | null };
  const team = (perf ?? []).map((p: PerfRow) => ({
    ...p,
    name: profileMap.get(p.recruiter_id)?.name ?? null,
    email: profileMap.get(p.recruiter_id)?.email ?? null,
  }));

  return NextResponse.json({ team });
}
