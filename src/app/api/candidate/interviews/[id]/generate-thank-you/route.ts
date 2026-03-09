/**
 * POST /api/candidate/interviews/[id]/generate-thank-you
 * Generate AI thank-you email for the interviewer.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireApiAuth } from '@/lib/api-auth';
import { callClaude, CLAUDE_MODEL } from '@/lib/ai/anthropic';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

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
    .select(`
      id, interview_type, interviewer_name, interviewer_title, post_interview_notes,
      job:jobs(title, company)
    `)
    .eq('id', id)
    .eq('candidate_id', candidateId)
    .single();

  if (fetchErr || !interview) return NextResponse.json({ error: 'Interview not found' }, { status: 404 });

  const job = Array.isArray(interview.job) ? interview.job[0] : interview.job;
  const prompt = `Generate a professional thank-you email for a job interview.

Interviewer: ${interview.interviewer_name || 'Hiring Manager'}, ${interview.interviewer_title || ''}
Company: ${job?.company ?? 'the company'}
Role: ${job?.title ?? 'the position'}
Interview type: ${interview.interview_type || 'interview'}
Key discussion points (optional): ${interview.post_interview_notes || 'General conversation about the role and company.'}

Requirements:
- Professional but warm tone
- Reference 1-2 specific discussion points if provided
- Reiterate interest in the role and company
- Mention next steps or looking forward to hearing back
- Keep under 200 words

Respond with valid JSON only (no markdown):
{ "subject": "Thank you - [Role] at [Company]", "body": "Dear [Name],\\n\\n..." }`;

  try {
    const text = await callClaude(prompt, { model: CLAUDE_MODEL, maxTokens: 800 });
    const jsonMatch = text.trim().match(/\{[\s\S]*\}/);
    const note = jsonMatch ? JSON.parse(jsonMatch[0]) : { subject: '', body: '' };
    return NextResponse.json(note);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Thank-you note generation failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
