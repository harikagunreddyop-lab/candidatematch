/**
 * POST /api/candidate/interviews/[id]/questions/[qid]/feedback
 * Get AI feedback for a STAR or freeform answer.
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
  { params }: { params: Promise<{ id: string; qid: string }> }
) {
  const auth = await requireApiAuth(req, { effectiveRoles: ['candidate'] });
  if (auth instanceof Response) return auth;

  const { id, qid } = await params;
  if (!id || !qid) return NextResponse.json({ error: 'id and qid required' }, { status: 400 });

  const supabase = createServiceClient();
  const candidateId = await getCandidateId(supabase, auth.user.id);
  if (!candidateId) return NextResponse.json({ error: 'Candidate profile not found' }, { status: 403 });

  const { data: question, error: qErr } = await supabase
    .from('interview_questions_prep')
    .select('id, question_text, candidate_answer, star_method, interview_id')
    .eq('id', qid)
    .eq('interview_id', id)
    .single();
  if (qErr || !question) return NextResponse.json({ error: 'Question not found' }, { status: 404 });

  const { data: interview } = await supabase
    .from('interviews')
    .select('id')
    .eq('id', question.interview_id)
    .eq('candidate_id', candidateId)
    .single();
  if (!interview) return NextResponse.json({ error: 'Interview not found' }, { status: 404 });

  const star = question.star_method as { situation?: string; task?: string; action?: string; result?: string } | null;
  const hasStar = star && (star.situation || star.task || star.action || star.result);
  const answerText = question.candidate_answer || (hasStar
    ? `Situation: ${star?.situation || ''}\nTask: ${star?.task || ''}\nAction: ${star?.action || ''}\nResult: ${star?.result || ''}`
    : '');

  if (!answerText.trim()) {
    return NextResponse.json({ error: 'Provide an answer or STAR method response first' }, { status: 400 });
  }

  const prompt = hasStar
    ? `Evaluate this STAR method interview response.

Question: ${question.question_text}

Situation: ${star?.situation || '(empty)'}
Task: ${star?.task || '(empty)'}
Action: ${star?.action || '(empty)'}
Result: ${star?.result || '(empty)'}

Provide:
1. Completeness score (0-100) and one sentence summary.
2. Specific improvements for each section (Situation, Task, Action, Result).
3. One suggested rewording for impact.
4. Any quantification opportunities.

Respond in 2-4 short paragraphs, professional and constructive. No bullet lists.`
    : `Evaluate this interview answer.

Question: ${question.question_text}

Answer: ${answerText}

Provide:
1. Strength score (0-100) and one sentence summary.
2. 2-3 specific improvements.
3. One suggested rewording for clarity or impact.

Respond in 2-3 short paragraphs, professional and constructive. No bullet lists.`;

  try {
    const feedback = await callClaude(prompt, { model: CLAUDE_MODEL, maxTokens: 600 });

    await supabase
      .from('interview_questions_prep')
      .update({ ai_feedback: feedback, is_practiced: true })
      .eq('id', qid)
      .eq('interview_id', id);

    return NextResponse.json({ feedback });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Feedback generation failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
