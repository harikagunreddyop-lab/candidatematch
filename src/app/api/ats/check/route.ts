import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth, canAccessCandidate } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';
import { hasFeature } from '@/lib/feature-flags-server';
import { runAtsCheck } from '@/lib/matching';
import { rateLimitResponse } from '@/lib/rate-limit';
import { isValidUuid } from '@/lib/security';
import { checkDailyLimit } from '@/lib/usage-limits';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req, { roles: ['admin', 'recruiter', 'candidate'] });
  if (auth instanceof Response) return auth;

  const rl = await rateLimitResponse(req, 'ats', auth.user.id);
  if (rl) return rl;

  // Daily ATS check limit — applies to candidates only (admins/recruiters unrestricted)
  if (auth.profile.role === 'candidate') {
    const service = createServiceClient();
    const usage = await checkDailyLimit(service, auth.user.id, 'ats_checked', 'daily_ats_check_limit');
    if (!usage.allowed) {
      return NextResponse.json(
        { error: usage.errorMessage, limit: usage.limit, used: usage.used, reset_at: usage.reset_at },
        { status: 429 },
      );
    }
  }

  const body = await req.json().catch(() => ({}));
  const candidateId = String(body.candidate_id || '');
  const jobId = String(body.job_id || '');
  const resumeId = body.resume_id ? String(body.resume_id) : null;
  const resumeVersionId = body.resume_version_id ? String(body.resume_version_id) : null;

  if (!candidateId || !jobId) {
    return NextResponse.json({ error: 'candidate_id and job_id are required' }, { status: 400 });
  }
  if (!isValidUuid(candidateId) || !isValidUuid(jobId)) {
    return NextResponse.json({ error: 'Invalid candidate_id or job_id' }, { status: 400 });
  }

  const service = createServiceClient();
  const allowed = await canAccessCandidate(auth, candidateId, service);
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Admin-controlled access: recruiters need recruiter_run_ats_check, candidates need candidate_see_ats_fix_report
  if (auth.profile.role === 'recruiter') {
    const runAts = await hasFeature(service, auth.profile.id, 'recruiter', 'recruiter_run_ats_check', true);
    if (!runAts) return NextResponse.json({ error: 'ATS check is not enabled for your account. Ask an admin to grant access.' }, { status: 403 });
  } else if (auth.profile.role === 'candidate') {
    const runAts = await hasFeature(service, auth.profile.id, 'candidate', 'candidate_see_ats_fix_report', false);
    if (!runAts) return NextResponse.json({ error: 'ATS check is not enabled for your account. Ask an admin to grant access.' }, { status: 403 });
  }

  const { data: matchRow, error: matchErr } = await service
    .from('candidate_job_matches')
    .select('fit_score')
    .eq('candidate_id', candidateId)
    .eq('job_id', jobId)
    .maybeSingle();

  if (matchErr) return NextResponse.json({ error: matchErr.message }, { status: 500 });
  if (!matchRow) return NextResponse.json({ error: 'Match not found. Run matching first.' }, { status: 400 });

  try {
    const result = await runAtsCheck(service, candidateId, jobId, resumeId, { resumeVersionId: resumeVersionId || undefined });
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'ATS check failed' }, { status: 500 });
  }
}

