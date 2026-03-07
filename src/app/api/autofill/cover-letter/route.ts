import { NextRequest, NextResponse } from 'next/server';
import { authedClient } from '../_auth';

export const dynamic = 'force-dynamic';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

const CANDIDATE_FIELDS =
  'full_name, primary_title, skills, summary, experience, education';

export async function POST(req: NextRequest) {
  const auth = await authedClient(req);
  if (!auth) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: CORS_HEADERS },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON' },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const { jobTitle = '', company = '', jobDescription = '' } = (body as any) ?? {};

  const { data: candidate } = await auth.supabase
    .from('candidates')
    .select(CANDIDATE_FIELDS)
    .eq('user_id', auth.user.id)
    .single();

  if (!candidate) {
    return NextResponse.json(
      { error: 'No candidate profile found' },
      { status: 404, headers: CORS_HEADERS },
    );
  }

  const skills = Array.isArray(candidate.skills)
    ? candidate.skills.join(', ')
    : candidate.skills || '';
  const latestExp = Array.isArray(candidate.experience)
    ? candidate.experience[0]
    : null;
  const latestEdu = Array.isArray(candidate.education)
    ? candidate.education[0]
    : null;

  const systemPrompt = `You are an expert career coach and professional writer. 
Write concise, compelling cover letters that are specific to the role and company.
Keep it to 3 short paragraphs. Sound human, confident, and specific. 
Do NOT use generic phrases like "I am writing to express my interest".
Return ONLY the cover letter text, no subject line, no date, no headers.`;

  const userPrompt = `Write a cover letter for:
- Role: ${jobTitle || 'the advertised position'}
- Company: ${company || 'the company'}
- Job Description excerpt: ${String(jobDescription).slice(0, 800) || 'Not provided'}

Candidate background:
- Name: ${candidate.full_name}
- Current title: ${candidate.primary_title || 'Professional'}
- Skills: ${skills.slice(0, 300)}
- Summary: ${candidate.summary?.slice(0, 400) || ''}
- Most recent experience: ${
    latestExp ? `${latestExp.title} at ${latestExp.company}` : 'N/A'
  }
- Education: ${
    latestEdu ? `${latestEdu.degree} from ${latestEdu.institution}` : 'N/A'
  }

Write the cover letter now:`;

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return NextResponse.json(
      { error: 'AI not configured on this server' },
      { status: 503, headers: CORS_HEADERS },
    );
  }

  try {
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!aiRes.ok) {
      const errBody = await aiRes.json().catch(() => ({}));
      // eslint-disable-next-line
      return NextResponse.json(
        { error: 'AI generation failed', detail: (errBody as any)?.error?.message },
        { status: 502, headers: CORS_HEADERS },
      );
    }

    const aiData = await aiRes.json();
    // eslint-disable-next-line
    const coverLetter = (aiData as any).content?.[0]?.text?.trim() || '';

    return NextResponse.json(
      { cover_letter: coverLetter, tone: 'professional' },
      { headers: CORS_HEADERS },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Network error calling AI';
    return NextResponse.json(
      { error: message },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}

