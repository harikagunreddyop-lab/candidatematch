import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth, canAccessCandidate } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';
import { hasFeature } from '@/lib/feature-flags-server';
import { predictObjections } from '@/lib/ai';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req, { effectiveRoles: ['platform_admin', 'company_admin', 'recruiter', 'candidate'] });
  if (auth instanceof Response) return auth;

  const service = createServiceClient();
  if (auth.profile.role === 'candidate') {
    const canUse = await hasFeature(service, auth.user.id, 'candidate', 'candidate_see_ats_fix_report', false);
    if (!canUse) return NextResponse.json({ error: 'ATS fix report access is restricted' }, { status: 403 });
  } else if (auth.profile.role === 'recruiter') {
    const canUse = await hasFeature(service, auth.user.id, 'recruiter', 'recruiter_run_ats_check', true);
    if (!canUse) return NextResponse.json({ error: 'ATS check access is restricted' }, { status: 403 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'AI service unavailable' }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const candidateId = String(body.candidate_id || '');
  const jobId = String(body.job_id || '');

  if (!candidateId || !jobId) {
    return NextResponse.json({ error: 'candidate_id and job_id required' }, { status: 400 });
  }

  const allowed = await canAccessCandidate(auth, candidateId, service);
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const [{ data: candidate }, { data: job }, { data: match }] = await Promise.all([
    service.from('candidates').select('primary_title, experience').eq('id', candidateId).single(),
    service.from('jobs').select('title, company, jd_clean, jd_raw').eq('id', jobId).single(),
    service.from('candidate_job_matches').select('ats_score, missing_keywords').eq('candidate_id', candidateId).eq('job_id', jobId).maybeSingle(),
  ]);

  if (!candidate || !job) {
    return NextResponse.json({ error: 'Candidate or job not found' }, { status: 404 });
  }

  const jd = (job.jd_clean || job.jd_raw || '').slice(0, 2000);
  const bullets = (candidate.experience as any[])?.flatMap((e: any) => e.responsibilities || []).filter(Boolean).slice(0, 10) || [];
  const missing = (match?.missing_keywords as string[] | undefined) || [];
  const atsScore = typeof match?.ats_score === 'number' ? match.ats_score : 0;

  const result = await predictObjections(
    job.title,
    job.company,
    jd,
    candidate.primary_title || 'Candidate',
    bullets,
    missing,
    atsScore
  );

  if (!result) return NextResponse.json({ error: 'AI analysis failed' }, { status: 502 });
  return NextResponse.json(result);
}
