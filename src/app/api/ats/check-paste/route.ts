import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';
import { isValidUuid } from '@/lib/security';
import {
  normalizeCandidate,
  computeFinalDecision,
} from '@/lib/ats-v3';
import { classifyJobFamily } from '@/lib/ats-v3/role-family-classifier';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req, {
    effectiveRoles: ['platform_admin', 'company_admin', 'recruiter', 'candidate'],
  });
  if (auth instanceof Response) return auth;

  const body = await req.json().catch(() => ({}));
  const {
    candidate_id,
    jd_text,
    resume_id,
  } = body as {
    candidate_id?: string;
    jd_text?: string;
    resume_id?: string;
  };

  if (!candidate_id || !jd_text?.trim()) {
    return NextResponse.json(
      { error: 'candidate_id and jd_text are required' },
      { status: 400 },
    );
  }
  if (!isValidUuid(candidate_id)) {
    return NextResponse.json({ error: 'Invalid candidate_id' }, { status: 400 });
  }

  const service = createServiceClient();

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
      hypothesisId: 'H4',
      location: 'src/app/api/ats/check-paste/route.ts:40',
      message: 'ATS check-paste request received',
      data: {
        has_candidate_id: !!candidate_id,
        has_jd_text: !!jd_text && jd_text.trim().length > 0,
        has_resume_id: !!resume_id,
        jd_text_length: jd_text?.length ?? 0,
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion agent log

  // Fetch candidate core data
  const { data: candidateRow } = await service
    .from('candidates')
    .select('id, skills, tools, primary_title, secondary_titles, years_of_experience, parsed_resume_text')
    .eq('id', candidate_id)
    .maybeSingle();

  if (!candidateRow) {
    return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
  }

  // Resolve resume text: specific resume if provided, else parsed_resume_text
  let resumeText: string = candidateRow.parsed_resume_text ?? '';
  let resolvedResumeId: string | null = null;

  if (resume_id && isValidUuid(resume_id)) {
    const { data: resumeRow } = await service
      .from('candidate_resumes')
      .select('id, raw_text, parsed_text')
      .eq('id', resume_id)
      .maybeSingle();
    if (resumeRow) {
      resolvedResumeId = resumeRow.id;
      resumeText = resumeRow.raw_text ?? resumeRow.parsed_text ?? resumeText;
    }
  }

  if (!resumeText?.trim()) {
    return NextResponse.json(
      { error: 'No resume text available for candidate' },
      { status: 422 },
    );
  }

  // Build a temporary job profile from pasted JD text.
  // We do NOT persist this; it is used only for ephemeral scoring.
  const family = classifyJobFamily('Pasted job', String(jd_text));

  const tempJobProfile = {
    job_id: 'pasted-jd',
    title: 'Pasted job',
    family: family.family,
    family_confidence: family.confidence,
    seniority: null,
    domain_tags: [] as string[],
    industry_vertical: null as string | null,
    requirements: [],
    responsibilities: [],
    min_years: null as number | null,
    preferred_years: null as number | null,
    required_education: null as any,
    required_certifications: [] as string[],
    location_type: null as any,
    work_auth_required: false,
    raw_description: String(jd_text),
    extracted_at: new Date().toISOString(),
    model_used: 'pasted-jd',
  };

  // Build canonical candidate profile using existing structured data
  const { data: expRows } = await service
    .from('candidate_experiences')
    .select('title, company, start_date, end_date, current, bullets')
    .eq('candidate_id', candidate_id)
    .order('start_date', { ascending: false });

  const candidateProfile = await normalizeCandidate(
    candidate_id,
    resolvedResumeId ?? 'pasted',
    resumeText,
    {
      skills: candidateRow.skills ?? [],
      tools: candidateRow.tools ?? [],
      primary_title: candidateRow.primary_title ?? undefined,
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
    },
  );

  const decision = computeFinalDecision(tempJobProfile, candidateProfile);

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
      hypothesisId: 'H5',
      location: 'src/app/api/ats/check-paste/route.ts:129',
      message: 'ATS check-paste decision computed',
      data: {
        candidate_id,
        final_decision_score: decision.final_decision_score,
        eligibility_status: decision.eligibility.status,
        decision_action: decision.decision_action,
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion agent log

  const matched_keywords =
    decision.role_fit_breakdown.matched_requirements ?? [];
  const missing_keywords =
    decision.role_fit_breakdown.missing_requirements ?? [];

  return NextResponse.json({
    // For pasted-JD checks, expose the underlying role_fit_score as the primary
    // "ATS score" shown in the UI. The final_decision_score still factors in
    // gates, confidence, and penalties and is available separately.
    ats_score: decision.role_fit_score,
    ats_final_score: decision.final_decision_score,
    ats_reason: decision.decision_summary,
    ats_breakdown: decision,
    matched_keywords,
    missing_keywords,
  });
}

