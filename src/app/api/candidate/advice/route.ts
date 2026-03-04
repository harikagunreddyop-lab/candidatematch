import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireApiAuth, canAccessCandidate } from '@/lib/api-auth';
import { analyzeResume } from '@/lib/resume-intelligence';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req, { roles: ['admin', 'recruiter', 'candidate'] });
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

  // Feature flag: advice.candidate.enabled
  try {
    const { data: flagRow } = await supabase
      .from('feature_flags')
      .select('value')
      .eq('key', 'advice.candidate.enabled')
      .maybeSingle();
    const enabled = flagRow?.value === true || flagRow?.value === 'true' || flagRow?.value === '"true"';
    if (!enabled) {
      return NextResponse.json(
        { error: 'Candidate advice engine is disabled (advice.candidate.enabled flag).' },
        { status: 403 },
      );
    }
  } catch {
    return NextResponse.json(
      { error: 'Feature flags not available; candidate advice disabled.' },
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

  let requiredSkills: string[] = [];
  if (jobId) {
    const { data: job } = await supabase
      .from('jobs')
      .select('structured_requirements, title, company')
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

  const resumeText = String(candidate.parsed_resume_text || '').slice(0, 10000);
  const experience = Array.isArray(candidate.experience) ? candidate.experience : [];
  const candidateSkills: string[] = Array.isArray(candidate.skills) ? candidate.skills : [];

  const intel = analyzeResume(resumeText, experience, requiredSkills, candidateSkills);

  if (!ANTHROPIC_API_KEY) {
    return NextResponse.json({
      candidate_id: candidateId,
      job_id: jobId,
      analysis: intel,
      suggestions: null,
      warning: 'ANTHROPIC_API_KEY not set, returning raw analysis only.',
    });
  }

  const prompt = `
You are a career coach helping a candidate maximise interview chances.

Resume analysis (JSON):
${JSON.stringify(intel, null, 2)}

Required skills for the target job (if any):
${JSON.stringify(requiredSkills || [], null, 2)}

Candidate skills:
${JSON.stringify(candidateSkills || [], null, 2)}

Write:
- A short summary of the candidate's current position.
- 3–5 concrete resume improvement suggestions.
- 3–5 skill recommendations with why they matter in the market.
- 2–3 job targeting recommendations.

Return ONLY valid JSON:
{
  "summary": "...",
  "resume_improvements": ["..."],
  "skill_recommendations": ["..."],
  "job_targeting": ["..."]
}
`.trim();

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 700,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({
      candidate_id: candidateId,
      job_id: jobId,
      analysis: intel,
      suggestions_error: `LLM call failed: ${res.status} ${text.slice(0, 300)}`,
    }, { status: 500 });
  }

  const data = await res.json();
  const text = data.content?.[0]?.text || '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return NextResponse.json({
      candidate_id: candidateId,
      job_id: jobId,
      analysis: intel,
      suggestions_error: 'Advice response not parseable',
    }, { status: 500 });
  }

  let parsed: any;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    return NextResponse.json({
      candidate_id: candidateId,
      job_id: jobId,
      analysis: intel,
      suggestions_error: 'Advice JSON parse failed',
    }, { status: 500 });
  }

  return NextResponse.json({
    candidate_id: candidateId,
    job_id: jobId,
    analysis: intel,
    suggestions: parsed,
  });
}

