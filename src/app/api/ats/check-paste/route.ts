import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth, canAccessCandidate } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';
import { hasFeature } from '@/lib/feature-flags-server';
import { runAtsCheckPasted } from '@/lib/matching';
import { rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/** POST: Check ATS score for a pasted job description. Ephemeral — no persist. */
export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req, { roles: ['admin', 'recruiter', 'candidate'] });
  if (auth instanceof Response) return auth;

  const rl = rateLimitResponse(req, 'ats', auth.user.id);
  if (rl) return rl;

  const body = await req.json().catch(() => ({}));
  const candidateId = String(body.candidate_id || '').trim();
  const jdText = String(body.jd_text || body.jd || '').trim();
  const resumeId = body.resume_id ? String(body.resume_id) : null;

  if (!candidateId || !jdText) {
    return NextResponse.json({ error: 'candidate_id and jd_text are required' }, { status: 400 });
  }

  const service = createServiceClient();
  const allowed = await canAccessCandidate(auth, candidateId, service);
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  if (auth.profile.role === 'recruiter') {
    const runAts = await hasFeature(service, auth.profile.id, 'recruiter', 'recruiter_run_ats_check', true);
    if (!runAts) return NextResponse.json({ error: 'ATS check is not enabled for your account. Ask an admin to grant access.' }, { status: 403 });
  } else if (auth.profile.role === 'candidate') {
    const runAts = await hasFeature(service, auth.profile.id, 'candidate', 'candidate_see_ats_fix_report', false);
    if (!runAts) return NextResponse.json({ error: 'ATS check is not enabled for your account. Ask an admin to grant access.' }, { status: 403 });
  }

  try {
    const result = await runAtsCheckPasted(service, candidateId, jdText, resumeId ?? undefined);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'ATS check failed' }, { status: 500 });
  }
}
