/**
 * POST /api/ats/explain
 * Elite AI — Human-readable ATS explanation
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';
import { hasFeature } from '@/lib/feature-flags-server';
import { explainATSScore } from '@/lib/ai';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req, { roles: ['admin', 'recruiter', 'candidate'] });
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
  const atsBreakdown = body.ats_breakdown;
  const atsScore = typeof body.ats_score === 'number' ? body.ats_score : (atsBreakdown?.dimensions ? 0 : null);
  const jobTitle = String(body.job_title || '');
  const candidateTitle = String(body.candidate_title || 'Candidate');

  if (!atsBreakdown || !jobTitle) {
    return NextResponse.json({ error: 'ats_breakdown and job_title required' }, { status: 400 });
  }

  const score = atsScore ?? (typeof atsBreakdown.total_score === 'number' ? atsBreakdown.total_score : 0);
  const combined = {
    ...atsBreakdown,
    total_score: score,
    band: atsBreakdown.band ?? (score >= 90 ? 'elite' : score >= 80 ? 'strong' : score >= 70 ? 'possible' : 'weak'),
    gate_passed: atsBreakdown.gate_passed ?? score >= 75,
    gate_reason: atsBreakdown.gate_reason ?? '',
  };

  const result = await explainATSScore(
    combined as Parameters<typeof explainATSScore>[0],
    jobTitle,
    candidateTitle || undefined
  );

  if (!result) return NextResponse.json({ error: 'AI explanation failed' }, { status: 502 });
  return NextResponse.json(result);
}
