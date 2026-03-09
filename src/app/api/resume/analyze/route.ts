import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireApiAuth, canAccessCandidate } from '@/lib/api-auth';
import { analyzeResume } from '@/lib/resume-intelligence';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req, { effectiveRoles: ['platform_admin', 'company_admin', 'recruiter', 'candidate'] });
  if (auth instanceof Response) return auth;
  const supabase = createServiceClient();

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const candidateId = String(body.candidate_id || '').trim();
  const jobId = body.job_id ? String(body.job_id).trim() : null;
  if (!candidateId) {
    return NextResponse.json({ error: 'candidate_id is required' }, { status: 400 });
  }

  const allowed = await canAccessCandidate(auth, candidateId, supabase);
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Optional feature flag: engine.resume_intelligence
  try {
    const { data: flagRow } = await supabase
      .from('feature_flags')
      .select('value')
      .eq('key', 'engine.resume_intelligence')
      .maybeSingle();
    const enabled = flagRow?.value === true || flagRow?.value === 'true' || flagRow?.value === '"true"';
    if (!enabled) {
      return NextResponse.json(
        { error: 'Resume intelligence engine is disabled (engine.resume_intelligence flag).' },
        { status: 403 },
      );
    }
  } catch {
    // If flags table missing, treat as disabled.
    return NextResponse.json(
      { error: 'Feature flags not available; resume intelligence disabled.' },
      { status: 503 },
    );
  }

  const { data: candidate, error: candErr } = await supabase
    .from('candidates')
    .select('id, parsed_resume_text, experience, skills')
    .eq('id', candidateId)
    .single();
  if (candErr || !candidate) {
    return NextResponse.json({ error: candErr?.message || 'Candidate not found' }, { status: 404 });
  }

  const resumeText = String(candidate.parsed_resume_text || '').slice(0, 10000);
  const experience = Array.isArray(candidate.experience) ? candidate.experience : [];

  let requiredSkills: string[] = [];
  if (jobId) {
    const { data: job } = await supabase
      .from('jobs')
      .select('structured_requirements')
      .eq('id', jobId)
      .maybeSingle();
    const reqs = job?.structured_requirements || null;
    if (reqs && typeof reqs === 'object') {
      requiredSkills = [
        ...(reqs.must_have_skills || []),
        ...(reqs.nice_to_have_skills || []),
      ];
    }
  }

  const candidateSkills: string[] = Array.isArray(candidate.skills)
    ? candidate.skills
    : [];

  const result = analyzeResume(resumeText, experience, requiredSkills, candidateSkills);

  return NextResponse.json({
    candidate_id: candidateId,
    job_id: jobId,
    ...result,
  });
}

