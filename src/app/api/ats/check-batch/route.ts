/**
 * POST /api/ats/check-batch
 * Scores all available resumes for a job, returns best + per-resume scores.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth, canAccessCandidate } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';
import { hasFeature } from '@/lib/feature-flags-server';
import { runAtsCheckBatch } from '@/lib/matching';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req, { roles: ['admin', 'recruiter', 'candidate'] });
  if (auth instanceof Response) return auth;

  const body = await req.json().catch(() => ({}));
  const candidateId = String(body.candidate_id || '');
  const jobId = String(body.job_id || '');

  if (!candidateId || !jobId) {
    return NextResponse.json({ error: 'candidate_id and job_id are required' }, { status: 400 });
  }

  const service = createServiceClient();
  const allowed = await canAccessCandidate(auth, candidateId, service);
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  if (auth.profile.role === 'recruiter') {
    const runAts = await hasFeature(service, auth.profile.id, 'recruiter', 'recruiter_run_ats_check', true);
    if (!runAts) return NextResponse.json({ error: 'ATS check is not enabled for your account.' }, { status: 403 });
  } else if (auth.profile.role === 'candidate') {
    const runAts = await hasFeature(service, auth.profile.id, 'candidate', 'candidate_see_ats_fix_report', false);
    if (!runAts) return NextResponse.json({ error: 'ATS check is not enabled for your account.' }, { status: 403 });
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
    const result = await runAtsCheckBatch(service, candidateId, jobId, {
      actorUserId: auth.user.id,
      source: 'manual',
    });
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'ATS check failed' }, { status: 500 });
  }
}
