/**
 * POST /api/candidate/mock-interview/complete
 * Save a completed mock session and return overall AI feedback + scores.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireApiAuth } from '@/lib/api-auth';
import { callClaude, CLAUDE_MODEL } from '@/lib/ai/anthropic';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function getCandidateId(supabase: ReturnType<typeof createServiceClient>, userId: string) {
  const { data } = await supabase.from('candidates').select('id').eq('user_id', userId).single();
  return data?.id ?? null;
}

export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req, { effectiveRoles: ['candidate'] });
  if (auth instanceof Response) return auth;

  const body = await req.json().catch(() => ({}));
  const { interview_id, session_type = 'behavioral', questions_asked, responses, duration_seconds } = body;

  if (!Array.isArray(questions_asked) || !Array.isArray(responses) || questions_asked.length === 0) {
    return NextResponse.json(
      { error: 'questions_asked and responses arrays required (non-empty)' },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();
  const candidateId = await getCandidateId(supabase, auth.user.id);
  if (!candidateId) return NextResponse.json({ error: 'Candidate profile not found' }, { status: 403 });

  if (interview_id) {
    const { data: interview } = await supabase
      .from('interviews')
      .select('id')
      .eq('id', interview_id)
      .eq('candidate_id', candidateId)
      .single();
    if (!interview) return NextResponse.json({ error: 'Interview not found' }, { status: 404 });
  }

  const qList = questions_asked.map((q: string | { question: string }) => (typeof q === 'string' ? q : q?.question ?? ''));
  const rList = responses.map((r: string | { question?: string; answer: string }) =>
    typeof r === 'string' ? { answer: r } : { question: r?.question, answer: r?.answer ?? '' }
  );

  const summary = qList
    .map((q, i) => `Q: ${q}\nA: ${rList[i]?.answer ?? '(no answer)'}`)
    .join('\n\n');

  const prompt = `You are an interview coach. Review this mock interview session and provide overall feedback.

Session type: ${session_type}
Questions and answers:
${summary}

Respond with valid JSON only (no markdown):
{
  "overall_score": 0-100,
  "confidence_score": 0-100,
  "summary": "2-3 sentences overall performance",
  "strengths": ["strength 1", "strength 2"],
  "improvement_areas": ["area 1", "area 2"],
  "tip": "One actionable tip for next time"
}`;

  let aiFeedback: Record<string, unknown> = {};
  try {
    const text = await callClaude(prompt, { model: CLAUDE_MODEL, maxTokens: 800 });
    const jsonMatch = text.trim().match(/\{[\s\S]*\}/);
    aiFeedback = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
  } catch {
    aiFeedback = { summary: 'Session completed.', overall_score: 0, confidence_score: 0 };
  }

  const overallScore = typeof aiFeedback.overall_score === 'number' ? aiFeedback.overall_score : null;
  const confidenceScore = typeof aiFeedback.confidence_score === 'number' ? aiFeedback.confidence_score : null;

  const questionsPayload = qList.map((q: string) => ({ question: q, context: '' }));
  const responsesPayload = qList.map((q: string, i: number) => ({
    question: q,
    answer: rList[i]?.answer ?? '',
    feedback: null,
  }));

  const { data: session, error } = await supabase
    .from('mock_interview_sessions')
    .insert({
      candidate_id: candidateId,
      interview_id: interview_id || null,
      session_type,
      questions_asked: questionsPayload,
      responses: responsesPayload,
      ai_feedback: aiFeedback,
      overall_score: overallScore,
      confidence_score: confidenceScore,
      duration_seconds: typeof duration_seconds === 'number' ? duration_seconds : null,
      completed_at: new Date().toISOString(),
    })
    .select('id, overall_score, confidence_score, ai_feedback')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({
    session_id: session.id,
    overall_score: session.overall_score ?? overallScore,
    confidence_score: session.confidence_score ?? confidenceScore,
    ai_feedback: session.ai_feedback ?? aiFeedback,
  });
}
