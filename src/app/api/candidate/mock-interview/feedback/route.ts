/**
 * POST /api/candidate/mock-interview/feedback
 * Get AI feedback for a single mock interview answer. Body: { question, answer }
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { callClaude, CLAUDE_MODEL } from '@/lib/ai/anthropic';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req, { effectiveRoles: ['candidate'] });
  if (auth instanceof Response) return auth;

  const body = await req.json().catch(() => ({}));
  const { question, answer } = body;
  if (!question || !answer) {
    return NextResponse.json({ error: 'question and answer required' }, { status: 400 });
  }

  const prompt = `You are an interview coach. Evaluate this candidate's answer to an interview question.

Question: ${question}

Candidate's answer: ${answer}

Respond with valid JSON only (no markdown):
{
  "score": 0-100,
  "feedback": "2-4 sentences: what was strong, what to improve, one specific tip",
  "strengths": ["short strength 1", "short strength 2"],
  "improvements": ["short improvement 1", "short improvement 2"]
}

Be constructive and specific.`;

  try {
    const text = await callClaude(prompt, { model: CLAUDE_MODEL, maxTokens: 500 });
    const jsonMatch = text.trim().match(/\{[\s\S]*\}/);
    const result = jsonMatch ? JSON.parse(jsonMatch[0]) : { score: 0, feedback: 'Could not evaluate.', strengths: [], improvements: [] };
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Feedback failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
