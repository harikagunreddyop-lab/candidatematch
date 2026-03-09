import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireApiAuth } from '@/lib/api-auth';
import { callClaude, CLAUDE_MODEL } from '@/lib/ai/anthropic';
import { isValidUuid } from '@/lib/security';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req, { effectiveRoles: ['candidate', 'platform_admin', 'company_admin', 'recruiter'] });
  if (auth instanceof Response) return auth;

  let body: { jobId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const jobId = body.jobId ? String(body.jobId).trim() : '';
  if (!jobId || !isValidUuid(jobId)) {
    return NextResponse.json({ error: 'jobId required' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: job } = await supabase
    .from('jobs')
    .select('id, title, company, jd_clean, jd_raw')
    .eq('id', jobId)
    .single();
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

  const jd = (job.jd_clean || job.jd_raw || '').slice(0, 6000);
  const prompt = `Generate 5 interview questions for this role. Return valid JSON only, no markdown.
Role: ${job.title} at ${job.company}
Job description excerpt: ${jd}

Output format:
{
  "questions": [
    {
      "question": "string",
      "context": "1 sentence why this is asked",
      "difficulty": "medium",
      "sampleAnswer": "2-3 sentence strong answer"
    }
  ]
}
Use difficulty: "easy", "medium", or "hard". Include behavioral and role-specific questions.`;

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
