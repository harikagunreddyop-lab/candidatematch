/**
 * GET /api/recruiter/dashboard/follow-ups — Candidates needing follow-up (with optional AI suggestions).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireApiAuth } from '@/lib/api-auth';
import { handleAPIError } from '@/lib/errors';
import type { FollowUpRecommendation } from '@/types/recruiter-dashboard';

export const dynamic = 'force-dynamic';

function daysSince(d: string): number {
  const then = new Date(d).getTime();
  const now = Date.now();
  return Math.floor((now - then) / 86400000);
}

export async function GET(req: NextRequest) {
  try {
    const authResult = await requireApiAuth(req, { effectiveRoles: ['platform_admin', 'company_admin', 'recruiter'] });
    if (authResult instanceof NextResponse) return authResult;
    const companyId = authResult.profile.company_id;
    if (!companyId)
      return NextResponse.json({ error: 'No company context' }, { status: 403 });

    const supabase = createServiceClient();
    const { data: companyJobs } = await supabase
      .from('jobs')
      .select('id')
      .eq('company_id', companyId)
      .eq('is_active', true);
    const jobIds = (companyJobs ?? []).map((j: { id: string }) => j.id);
    if (jobIds.length === 0)
      return NextResponse.json({ follow_ups: [] });

    const { data: applications } = await supabase
      .from('applications')
      .select(`
        id,
        status,
        updated_at,
        candidate:candidates(id, full_name),
        job:jobs(id, title)
      `)
      .in('job_id', jobIds)
      .in('status', ['applied', 'screening', 'interview'])
      .order('updated_at', { ascending: true })
      .limit(50);

    const recommendations: FollowUpRecommendation[] = [];
    const seen = new Set<string>();
    for (const a of applications ?? []) {
      const app = a as {
        id: string;
        status: string;
        updated_at: string;
        candidate?: { id: string; full_name?: string } | null;
        job?: { id: string; title?: string } | null;
      };
      const candidateId = app.candidate && !Array.isArray(app.candidate) ? (app.candidate as { id: string }).id : null;
      const candidateName = app.candidate && !Array.isArray(app.candidate) ? (app.candidate as { full_name?: string }).full_name : 'Candidate';
      const jobTitle = app.job && !Array.isArray(app.job) ? (app.job as { title?: string }).title : 'Role';
      if (!candidateId || seen.has(candidateId)) continue;
      const days = daysSince(app.updated_at);
      if (days < 2) continue;
      seen.add(candidateId);
      let urgency: 'low' | 'medium' | 'high' = 'medium';
      if (days >= 7) urgency = 'high';
      else if (days <= 3) urgency = 'low';
      recommendations.push({
        candidate_id: candidateId,
        candidate_name: candidateName ?? 'Candidate',
        last_contact: app.updated_at,
        days_since_contact: days,
        context: `Applied for ${jobTitle}; status: ${app.status}`,
        recommended_action: 'email',
        urgency,
        success_probability: Math.max(30, 80 - days * 5),
        application_id: app.id,
        job_title: jobTitle,
      });
    }

    recommendations.sort((a, b) => {
      const w = { low: 1, medium: 2, high: 3 };
      return w[b.urgency] * (b.success_probability ?? 50) - w[a.urgency] * (a.success_probability ?? 50);
    });

    return NextResponse.json({ follow_ups: recommendations.slice(0, 20) });
  } catch (e) {
    return handleAPIError(e);
  }
}
