/**
 * POST /api/candidate/interviews/[id]/research
 * Generate AI company research summary for interview prep.
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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiAuth(req, { effectiveRoles: ['candidate'] });
  if (auth instanceof Response) return auth;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const supabase = createServiceClient();
  const candidateId = await getCandidateId(supabase, auth.user.id);
  if (!candidateId) return NextResponse.json({ error: 'Candidate profile not found' }, { status: 403 });

  const { data: interview, error: fetchErr } = await supabase
    .from('interviews')
    .select('id, job:jobs(id, title, company, jd_clean, jd_raw)')
    .eq('id', id)
    .eq('candidate_id', candidateId)
    .single();

  if (fetchErr || !interview) return NextResponse.json({ error: 'Interview not found' }, { status: 404 });

  const job = Array.isArray(interview.job) ? interview.job[0] : interview.job;
  const companyName = job?.company ?? 'the company';
  const jobTitle = job?.title ?? 'the role';
  const jd = (job?.jd_clean || job?.jd_raw || '').slice(0, 4000);

  const prompt = `You are an interview coach. Provide a concise company research summary for interview preparation.

Company: ${companyName}
Role: ${jobTitle}
${jd ? `Job description excerpt:\n${jd}\n` : ''}

Respond with valid JSON only (no markdown, no code fence). Use this exact structure:
{
  "overview": "2-4 sentence company overview",
  "recentNews": ["1-2 recent achievements or news items"],
  "culture": ["2-3 culture highlights"],
  "products": ["key products or services"],
  "competitors": ["main competitors"],
  "challenges": ["1-2 challenges or strategic focus areas"],
  "questionsToAsk": ["3-5 smart questions to ask about company direction, team, or role"]
}

Keep each array item one sentence. Be factual and professional.`;

  try {
    const text = await callClaude(prompt, { model: CLAUDE_MODEL, maxTokens: 1500 });
    const jsonMatch = text.trim().match(/\{[\s\S]*\}/);
    const research = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    return NextResponse.json(research);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Research generation failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
