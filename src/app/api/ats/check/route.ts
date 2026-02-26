import { NextRequest, NextResponse } from 'next/server';
import { requireRecruiterOrAdmin, canAccessCandidate } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';
import { runAtsCheck } from '@/lib/matching';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = await requireRecruiterOrAdmin(req);
  if (auth instanceof Response) return auth;

  const body = await req.json().catch(() => ({}));
  const candidateId = String(body.candidate_id || '');
  const jobId = String(body.job_id || '');
  const resumeId = body.resume_id ? String(body.resume_id) : null;

  if (!candidateId || !jobId) {
    return NextResponse.json({ error: 'candidate_id and job_id are required' }, { status: 400 });
  }

  const service = createServiceClient();
  const allowed = await canAccessCandidate(auth, candidateId, service);
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data: matchRow, error: matchErr } = await service
    .from('candidate_job_matches')
    .select('fit_score')
    .eq('candidate_id', candidateId)
    .eq('job_id', jobId)
    .maybeSingle();

  if (matchErr) return NextResponse.json({ error: matchErr.message }, { status: 500 });
  if (!matchRow) return NextResponse.json({ error: 'Match not found. Run matching first.' }, { status: 400 });

  try {
    const result = await runAtsCheck(service, candidateId, jobId, resumeId);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'ATS check failed' }, { status: 500 });
  }
}

