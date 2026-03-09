/**
 * POST /api/ats/apply-decision
 * Elite AI — Smart apply decision (apply_now | tailor_first | avoid | wait)
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth, canAccessCandidate } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';
import { getApplyDecision } from '@/lib/ai';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req, { effectiveRoles: ['platform_admin', 'company_admin', 'recruiter', 'candidate'] });
  if (auth instanceof Response) return auth;

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'AI service unavailable' }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const candidateId = String(body.candidate_id || '');
  const jobId = String(body.job_id || '');

  if (!candidateId || !jobId) {
    return NextResponse.json({ error: 'candidate_id and job_id required' }, { status: 400 });
  }

  const service = createServiceClient();
  const allowed = await canAccessCandidate(auth, candidateId, service);
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const [{ data: job }, { data: match }] = await Promise.all([
    service.from('jobs').select('title, company').eq('id', jobId).single(),
    service.from('candidate_job_matches').select('ats_score, missing_keywords, matched_keywords, ats_breakdown').eq('candidate_id', candidateId).eq('job_id', jobId).maybeSingle(),
  ]);

  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

  const atsScore = typeof match?.ats_score === 'number' ? match.ats_score : 0;
  const missing = (match?.missing_keywords as string[] | undefined) || [];
  const matched = (match?.matched_keywords as string[] | undefined) || [];
  const breakdown = match?.ats_breakdown as { gate_passed?: boolean } | null;
  const gatePassed = breakdown?.gate_passed ?? (atsScore >= 75);

  const result = await getApplyDecision(
    job.title,
    job.company,
    atsScore,
    missing,
    matched,
    gatePassed
  );

  if (!result) return NextResponse.json({ error: 'AI analysis failed' }, { status: 502 });
  return NextResponse.json(result);
}
