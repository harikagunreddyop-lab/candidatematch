import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth, canAccessCandidate } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';
import { hasFeature } from '@/lib/feature-flags-server';
import {
  normalizeJob,
  normalizeCandidate,
  computeFinalDecision,
} from '@/lib/ats-v3';
import { rateLimitResponse } from '@/lib/rate-limit';
import { isValidUuid } from '@/lib/security';
import { checkDailyLimit } from '@/lib/usage-limits';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req, { effectiveRoles: ['platform_admin', 'company_admin', 'recruiter', 'candidate'] });
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

  const body: any = await req.json().catch(() => ({}));
  const candidateId = String(body.candidate_id ?? '');
  const jobId = String(body.job_id ?? '');
  const resumeId = body.resume_id ? String(body.resume_id) : null;

  if (!candidateId || !jobId) return NextResponse.json({ error: 'candidate_id and job_id are required' }, { status: 400 });
  if (!isValidUuid(candidateId) || !isValidUuid(jobId)) return NextResponse.json({ error: 'Invalid IDs' }, { status: 400 });

  const service = createServiceClient();
  const allowed = await canAccessCandidate(auth, candidateId, service);
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  if (auth.profile.role === 'recruiter') {
    const ok = await hasFeature(service, auth.profile.id, 'recruiter', 'recruiter_run_ats_check', true);
    if (!ok) return NextResponse.json({ error: 'ATS check not enabled for your account.' }, { status: 403 });
  } else if (auth.profile.role === 'candidate') {
    const ok = await hasFeature(service, auth.profile.id, 'candidate', 'candidate_see_ats_fix_report', false);
    if (!ok) return NextResponse.json({ error: 'ATS check not enabled for your account.' }, { status: 403 });
  }

  // Fetch job
  const { data: job } = await service.from('jobs').select('title, description, location').eq('id', jobId).single();
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

  // Fetch candidate + resume
  const { data: candidateRow } = await service
    .from('candidates')
    .select('skills, tools, primary_title, secondary_titles, years_of_experience, location, parsed_resume_text')
    .eq('id', candidateId)
    .single();
  if (!candidateRow) return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });

  let resumeText = candidateRow.parsed_resume_text ?? '';
  if (resumeId) {
    const { data: resumeRow } = await service
      .from('candidate_resumes')
      .select('raw_text, parsed_text')
      .eq('id', resumeId)
      .single();
    if (resumeRow?.raw_text || resumeRow?.parsed_text) {
      resumeText = resumeRow.raw_text ?? resumeRow.parsed_text ?? resumeText;
    }
  }

  // Build or load canonical job profile (cached)
  let jobProfile: any = null;
  const { data: cachedJob } = await service
    .from('job_canonical_profiles')
    .select('*')
    .eq('job_id', jobId)
    .maybeSingle();

  if (cachedJob) {
    jobProfile = cachedJob;
  } else {
    jobProfile = await normalizeJob(jobId, job.title, job.description, job.location);
    if (!jobProfile) {
      return NextResponse.json(
        { error: 'Could not parse job into canonical profile' },
        { status: 422 },
      );
    }
    await service.from('job_canonical_profiles').insert({
      ...jobProfile,
      requirements: JSON.stringify(jobProfile.requirements),
    });
  }

  // Build canonical candidate profile
  const { data: experienceRows } = await service
    .from('candidate_experiences')
    .select('title, company, start_date, end_date, current, bullets')
    .eq('candidate_id', candidateId)
    .order('start_date', { ascending: false });

  const candidateProfile = await normalizeCandidate(
    candidateId,
    resumeId ?? '',
    resumeText,
    {
      skills: candidateRow.skills ?? [],
      tools: candidateRow.tools ?? [],
      primary_title: candidateRow.primary_title ?? undefined,
      secondary_titles: candidateRow.secondary_titles ?? [],
      years_of_experience: candidateRow.years_of_experience ?? undefined,
      experience: (experienceRows ?? []).map((e: any) => ({
        title: e.title ?? '',
        company: e.company ?? '',
        start_date: e.start_date ?? null,
        end_date: e.end_date ?? null,
        current: e.current ?? false,
        bullets: e.bullets ?? [],
      })),
    },
  );

  // Compute ATS Engine v3 decision
  const decision = computeFinalDecision(jobProfile, candidateProfile);

  // Persist summary back onto candidate_job_matches for compatibility
  await service.from('candidate_job_matches').upsert({
    candidate_id: candidateId,
    job_id: jobId,
    ats_score: decision.final_decision_score,
    ats_band: decision.role_fit_band,
    ats_gate_passed: decision.eligibility.gate_passed,
    ats_breakdown: decision,
    resume_id: resumeId,
    ats_checked_at: new Date().toISOString(),
  }, { onConflict: 'candidate_id,job_id' });

  // Backwards-compatible shape for existing callers (e.g. score.worker)
  return NextResponse.json({
    ats_score: decision.final_decision_score,
    ats_role_fit_score: decision.role_fit_score,
    ats_readability_score: decision.readability_score,
    ats_gate_passed: decision.eligibility.gate_passed,
    ats_band: decision.role_fit_band,
    decision,
  });
}

