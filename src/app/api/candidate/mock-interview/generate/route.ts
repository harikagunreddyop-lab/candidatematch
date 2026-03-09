/**
 * POST /api/candidate/mock-interview/generate
 * Generate questions for a mock interview. Body: { interview_id? } or { job_id, session_type?, difficulty? }
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireApiAuth } from '@/lib/api-auth';
import { callClaude, CLAUDE_MODEL } from '@/lib/ai/anthropic';

export const dynamic = 'force-dynamic';
export const maxDuration = 45;

async function getCandidateId(supabase: ReturnType<typeof createServiceClient>, userId: string) {
  const { data } = await supabase.from('candidates').select('id').eq('user_id', userId).single();
  return data?.id ?? null;
}

export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req, { effectiveRoles: ['candidate'] });
  if (auth instanceof Response) return auth;

  const body = await req.json().catch(() => ({}));
  const { interview_id, job_id, session_type = 'behavioral', difficulty = 'mid' } = body;

  const supabase = createServiceClient();
  const candidateId = await getCandidateId(supabase, auth.user.id);
  if (!candidateId) return NextResponse.json({ error: 'Candidate profile not found' }, { status: 403 });

  let jobTitle = 'the role';
  let companyName = 'the company';
  let jd = '';

  if (interview_id) {
    const { data: interview } = await supabase
      .from('interviews')
      .select('job:jobs(id, title, company, jd_clean, jd_raw)')
      .eq('id', interview_id)
      .eq('candidate_id', candidateId)
      .single();
    if (!interview) return NextResponse.json({ error: 'Interview not found' }, { status: 404 });
    const job = Array.isArray(interview.job) ? interview.job[0] : interview.job;
    if (job) {
      jobTitle = job.title ?? jobTitle;
      companyName = job.company ?? companyName;
      jd = (job.jd_clean || job.jd_raw || '').slice(0, 4000);
    }
  } else if (job_id) {
    const { data: job } = await supabase
      .from('jobs')
      .select('id, title, company, jd_clean, jd_raw')
      .eq('id', job_id)
      .single();
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    jobTitle = job.title ?? jobTitle;
    companyName = job.company ?? companyName;
    jd = (job.jd_clean || job.jd_raw || '').slice(0, 4000);
  } else {
    return NextResponse.json({ error: 'interview_id or job_id required' }, { status: 400 });
  }

  const typeHint =
    session_type === 'technical'
      ? 'Focus on technical and role-specific questions (system design, coding concepts, tools).'
      : session_type === 'case_study'
        ? 'Include case study or scenario-based questions.'
        : 'Focus on behavioral questions (STAR format, past experience, teamwork, challenges).';

  const prompt = `Generate 5 interview practice questions for this role. ${typeHint}

Role: ${jobTitle} at ${companyName}
Difficulty: ${difficulty}
${jd ? `Job description excerpt:\n${jd}\n` : ''}

Return valid JSON only (no markdown):
{
  "questions": [
    {
      "question": "string",
      "context": "1 sentence why this is asked",
      "difficulty": "easy|medium|hard",
      "sampleAnswer": "2-3 sentence strong answer"
    }
  ]
}`;

  try {
    const text = await callClaude(prompt, { model: CLAUDE_MODEL, maxTokens: 1200 });
    const jsonMatch = text.trim().match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { questions: [] };
    const questions = Array.isArray(parsed.questions) ? parsed.questions : [];
    return NextResponse.json({ questions });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Generation failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
