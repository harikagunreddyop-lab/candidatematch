import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { callClaude, CLAUDE_MODEL } from '@/lib/ai/anthropic';

export const dynamic = 'force-dynamic';
export const maxDuration = 25;

export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req, { roles: ['candidate', 'admin', 'recruiter'] });
  if (auth instanceof Response) return auth;

  let body: { message?: string; history?: Array<{ role: string; content: string }> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) return NextResponse.json({ error: 'message required' }, { status: 400 });

  const history = Array.isArray(body.history) ? body.history.slice(-6) : [];
  const system = 'You are a concise, supportive career coach. Give actionable advice on job search, resumes, interviews, negotiation, and career growth. Keep replies under 200 words unless the user asks for more.';
  const prompt = history.length
    ? history.map((m: any) => `${m.role === 'user' ? 'User' : 'Coach'}: ${m.content}`).join('\n') + `\nUser: ${message}\nCoach:`
    : `User: ${message}\nCoach:`;

  try {
    const reply = await callClaude(prompt, { model: CLAUDE_MODEL, maxTokens: 500, system });
    return NextResponse.json({ reply: reply.trim() });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Chat failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
