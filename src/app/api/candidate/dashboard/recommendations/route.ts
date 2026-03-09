/**
 * GET /api/candidate/dashboard/recommendations
 * Top job recommendations for the candidate: best matches excluding already-applied jobs, with match reason and salary.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';
import { FREE_TIER_WEEKLY_MATCH_LIMIT } from '@/lib/usage-limits';

export const dynamic = 'force-dynamic';

const LIMIT = 5;

function getWeekStartUtc(now: Date): string {
  const d = new Date(now);
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
  d.setUTCDate(diff);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

export async function GET(req: NextRequest) {
  const authResult = await requireApiAuth(req, { effectiveRoles: ['candidate', 'platform_admin', 'company_admin', 'recruiter'] });
  if (authResult instanceof Response) return authResult;

  const supabase = createServiceClient();
  const userId = authResult.user.id;
  const weekStart = getWeekStartUtc(new Date());

  const [{ data: profile }, { data: candidate }] = await Promise.all([
    supabase.from('profiles').select('subscription_tier').eq('id', userId).single(),
    supabase.from('candidates').select('id').eq('user_id', userId).single(),
  ]);

  if (!candidate) {
    return NextResponse.json({ recommendations: [] });
  }

  const candidateId = (candidate as { id: string }).id;
  const isPro = (profile?.subscription_tier ?? 'free') === 'pro';

  const { data: appliedJobIds } = await supabase
    .from('applications')
    .select('job_id')
    .eq('candidate_id', candidateId);

  const excludeIds = (appliedJobIds ?? []).map((r: { job_id: string }) => r.job_id).filter(Boolean);
  let query = supabase
    .from('candidate_job_matches')
    .select(
      'id, job_id, fit_score, ats_score, match_reason, matched_keywords, missing_keywords, matched_at, job:jobs(id, title, company, location, remote_type, salary_min, salary_max, scraped_at, created_at)'
    )
    .eq('candidate_id', candidateId)
    .order('fit_score', { ascending: false });

  if (!isPro) {
    query = query.gte('matched_at', weekStart).limit(Math.min(LIMIT, FREE_TIER_WEEKLY_MATCH_LIMIT));
  }

  if (excludeIds.length > 0) {
    query = query.not('job_id', 'in', `(${excludeIds.join(',')})`);
  }

  const { data: matches } = await query.limit(LIMIT);

  const list = (matches ?? []).slice(0, LIMIT).map((m: Record<string, unknown>) => {
    const job = m.job as Record<string, unknown> | null;
    const score =
      typeof m.ats_score === 'number' ? m.ats_score : typeof m.fit_score === 'number' ? m.fit_score : 0;
    return {
      id: m.id,
      jobId: m.job_id,
      score,
      matchReason: m.match_reason ?? null,
      matchedKeywords: (m.matched_keywords as string[]) ?? [],
      missingKeywords: (m.missing_keywords as string[]) ?? [],
      matchedAt: m.matched_at,
      job: job
        ? {
            id: job.id,
            title: job.title,
            company: job.company,
            location: job.location ?? null,
            remoteType: job.remote_type ?? null,
            salaryMin: job.salary_min ?? null,
            salaryMax: job.salary_max ?? null,
            scrapedAt: job.scraped_at ?? job.created_at,
          }
        : null,
    };
  });

  // #region agent log
  fetch('http://127.0.0.1:7830/ingest/7e7b9384-2f83-41f7-a326-f10ef9606c50',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'f6067c'},body:JSON.stringify({sessionId:'f6067c',runId:'candidate-dashboard-post-fix',hypothesisId:'H3',location:'src/app/api/candidate/dashboard/recommendations/route.ts:90',message:'recommendations computed with tier-aware match scope',data:{candidateId,isPro,weekStart:!isPro?weekStart:null,recommendationCount:list.length},timestamp:Date.now()})}).catch(()=>{});
  // #endregion

  return NextResponse.json({ recommendations: list });
}
