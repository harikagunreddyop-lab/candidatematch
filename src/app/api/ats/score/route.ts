import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth, canAccessCandidate } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';
import { rateLimitResponse } from '@/lib/rate-limit';
import { isValidUuid } from '@/lib/security';
import { checkDailyLimit } from '@/lib/usage-limits';
import { hasFeature } from '@/lib/feature-flags-server';
import {
  normalizeJob,
  normalizeCandidate,
  computeFinalDecision,
  buildExplanation,
} from '@/lib/ats-v3';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  // 1. Auth + rate limit
  const auth = await requireApiAuth(req, { effectiveRoles: ['platform_admin', 'company_admin', 'recruiter', 'candidate'] });
  if (auth instanceof Response) return auth;
  const rl = await rateLimitResponse(req, 'ats', auth.user.id);
  if (rl) return rl;

  // 2. Daily limit for candidates
  if (auth.profile.role === 'candidate') {
    const service = createServiceClient();
    const usage = await checkDailyLimit(service, auth.user.id, 'ats_checked', 'daily_ats_check_limit');
    if (!usage.allowed) return NextResponse.json({ error: usage.errorMessage }, { status: 429 });
  }

  // 3. Parse + validate input
  const body = await req.json().catch(() => ({}));
  const { candidate_id, job_id, resume_id, mode = 'preview' } = body;

  // #region agent log
  fetch('http://127.0.0.1:7830/ingest/7e7b9384-2f83-41f7-a326-f10ef9606c50', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Debug-Session-Id': '6959bd',
    },
    body: JSON.stringify({
      sessionId: '6959bd',
      runId: 'pre-fix',
      hypothesisId: 'H1',
      location: 'src/app/api/ats/score/route.ts:36',
      message: 'ATS score request received',
      data: {
        has_candidate_id: !!candidate_id,
        has_job_id: !!job_id,
        has_resume_id: !!resume_id,
        mode,
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion agent log
  // mode: 'preview' = before applying, 'score' = on application submit

  if (!candidate_id || !job_id) return NextResponse.json({ error: 'candidate_id and job_id required' }, { status: 400 });
  if (!isValidUuid(candidate_id) || !isValidUuid(job_id)) return NextResponse.json({ error: 'Invalid IDs' }, { status: 400 });

  const service = createServiceClient();
  const allowed = await canAccessCandidate(auth, candidate_id, service);
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // 4. Feature flag check
  if (auth.profile.role === 'recruiter') {
    const ok = await hasFeature(service, auth.profile.id, 'recruiter', 'recruiter_run_ats_check', true);
    if (!ok) return NextResponse.json({ error: 'ATS check not enabled' }, { status: 403 });
  }

  // 5. Fetch job
  const { data: job } = await service.from('jobs').select('title, description, location').eq('id', job_id).single();
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

  // 6. Get or create job canonical profile (cached)
  let jobProfile = null;
  const { data: cachedJob } = await service
    .from('job_canonical_profiles')
    .select('*')
    .eq('job_id', job_id)
    .maybeSingle();

  if (cachedJob) {
    jobProfile = cachedJob;
  } else {
    jobProfile = await normalizeJob(job_id, job.title, job.description, job.location);
    if (!jobProfile) return NextResponse.json({ error: 'Could not parse job requirements' }, { status: 422 });
    await service.from('job_canonical_profiles').insert({
      ...jobProfile,
      requirements: JSON.stringify(jobProfile.requirements),
    });
  }

  // 7. Fetch candidate data
  const { data: candidateRow } = await service
    .from('candidates')
    .select('skills, tools, primary_title, secondary_titles, years_of_experience, location, parsed_resume_text')
    .eq('id', candidate_id).single();
  if (!candidateRow) return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });

  let resumeText = candidateRow.parsed_resume_text ?? '';
  if (resume_id && isValidUuid(resume_id)) {
    const { data: resumeRow } = await service.from('candidate_resumes').select('raw_text').eq('id', resume_id).single();
    if (resumeRow?.raw_text) resumeText = resumeRow.raw_text;
  }

  const { data: expRows } = await service
    .from('candidate_experiences')
    .select('title, company, start_date, end_date, current, bullets')
    .eq('candidate_id', candidate_id)
    .order('start_date', { ascending: false });

  // 8. Build candidate profile
  const candidateProfile = await normalizeCandidate(candidate_id, resume_id ?? '', resumeText, {
    skills: candidateRow.skills ?? [],
    tools: candidateRow.tools ?? [],
    primary_title: candidateRow.primary_title,
    secondary_titles: candidateRow.secondary_titles ?? [],
    years_of_experience: candidateRow.years_of_experience ?? undefined,
    experience: (expRows ?? []).map((e: any) => ({
      title: e.title ?? '',
      company: e.company ?? '',
      start_date: e.start_date ?? null,
      end_date: e.end_date ?? null,
      current: e.current ?? false,
      bullets: e.bullets ?? [],
    })),
  });

  // #region agent log
  fetch('http://127.0.0.1:7830/ingest/7e7b9384-2f83-41f7-a326-f10ef9606c50', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Debug-Session-Id': '6959bd',
    },
    body: JSON.stringify({
      sessionId: '6959bd',
      runId: 'pre-fix',
      hypothesisId: 'H2',
      location: 'src/app/api/ats/score/route.ts:92',
      message: 'Built profiles for ATS score',
      data: {
        job_id,
        candidate_id,
        job_description_length: (job as any)?.description?.length ?? null,
        resume_text_length: resumeText.length,
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion agent log

  // 9. Compute full decision
  const decision = computeFinalDecision(jobProfile as any, candidateProfile as any);
  const explanation = buildExplanation(decision);

  // #region agent log
  fetch('http://127.0.0.1:7830/ingest/7e7b9384-2f83-41f7-a326-f10ef9606c50', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Debug-Session-Id': '6959bd',
    },
    body: JSON.stringify({
      sessionId: '6959bd',
      runId: 'pre-fix',
      hypothesisId: 'H3',
      location: 'src/app/api/ats/score/route.ts:109',
      message: 'ATS decision computed',
      data: {
        job_id,
        candidate_id,
        final_decision_score: decision.final_decision_score,
        eligibility_status: decision.eligibility.status,
        decision_action: decision.decision_action,
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion agent log

  // 10. Persist to audit log
  await service.from('ats_decision_audit').insert({
    application_id: body.application_id ?? null,
    candidate_id,
    job_id,
    resume_id: resume_id ?? null,
    scoring_version: '3.0.0',
    role_fit_score: decision.role_fit_score,
    readability_score: decision.readability_score,
    final_decision_score: decision.final_decision_score,
    eligibility_result: decision.eligibility,
    role_fit_breakdown: decision.role_fit_breakdown,
    readability_breakdown: decision.readability_breakdown,
    penalty_breakdown: decision.penalty_breakdown,
    confidence_result: decision.confidence,
    family_match: decision.family_match,
    decision_action: decision.decision_action,
    decision_summary: decision.decision_summary,
    candidate_output: explanation.candidate_output,
    recruiter_output: explanation.recruiter_output,
  });

  // 11. If this is a scoring call (not preview), update application row
  if (mode === 'score' && body.application_id && isValidUuid(body.application_id)) {
    await service.from('applications').update({
      role_fit_score: decision.role_fit_score,
      readability_score: decision.readability_score,
      final_decision_score: decision.final_decision_score,
      family_match_type: decision.family_match.match_type,
      eligibility_status: decision.eligibility.status,
      confidence_score: decision.confidence.confidence_score,
      confidence_label: decision.confidence.confidence_label,
      penalty_summary: decision.penalty_breakdown,
      decision_action: decision.decision_action,
      decision_version: '3.0.0',
      decision_reasons: decision.fix_priorities,
      critical_gaps: decision.critical_gaps,
      adjacent_suggestions: decision.adjacent_role_suggestions,
      scored_at: new Date().toISOString(),
    }).eq('id', body.application_id);
  }

  // 12. Return role-appropriate view
  const isRecruiter = ['platform_admin', 'company_admin', 'recruiter'].includes(auth.profile.role);
  return NextResponse.json(isRecruiter ? explanation.recruiter_output : explanation.candidate_output);
}

