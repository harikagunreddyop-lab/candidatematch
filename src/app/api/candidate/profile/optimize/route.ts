/**
 * POST /api/candidate/profile/optimize
 * AI-powered profile optimization: suggestions for a given section (experience, summary, skills).
 * Returns: { suggestions: string[], score: number, reasoning: string }
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = 'claude-sonnet-4-20250514';

type Section = 'experience' | 'summary' | 'skills';

const SECTION_PROMPTS: Record<Section, string> = {
  experience: `You are an ATS (Applicant Tracking System) and recruiter-focused resume expert.
Analyze the experience/bullet points provided. Return JSON only (no markdown):
{
  "suggestions": ["string array of 3-5 concrete improvements: stronger action verbs, quantifiable metrics, keyword alignment for ATS"],
  "score": number 0-100 (profile strength for this section),
  "reasoning": "2-3 sentences explaining the score and top priority fix"
}
Focus on: action verbs (Led, Delivered, Scaled), numbers (%, $, time), and role-relevant keywords.`,

  summary: `You are an ATS and recruiter-focused profile expert.
Analyze the professional summary provided. Return JSON only (no markdown):
{
  "suggestions": ["string array of 2-4 improvements: clarity, keyword density, impact, length"],
  "score": number 0-100 (strength of summary),
  "reasoning": "2-3 sentences explaining the score and main suggestion"
}
Keep suggestions actionable and specific.`,

  skills: `You are a career and ATS expert.
Analyze the skills list provided. Return JSON only (no markdown):
{
  "suggestions": ["string array of 2-4 suggestions: missing high-value skills for the role type, ordering, grouping, or formatting for ATS"],
  "score": number 0-100 (how well skills are presented and aligned with typical job requirements),
  "reasoning": "2-3 sentences explaining the score and top suggestion"
}`,
};

export async function POST(req: NextRequest) {
  const authResult = await requireApiAuth(req, { effectiveRoles: ['candidate', 'platform_admin', 'company_admin', 'recruiter'] });
  if (authResult instanceof Response) return authResult;

  if (!ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'AI not configured' }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const section = body?.section as Section | undefined;
  const content = typeof body?.content === 'string' ? body.content.trim() : '';

  if (!section || !SECTION_PROMPTS[section]) {
    return NextResponse.json(
      { error: 'section must be one of: experience, summary, skills' },
      { status: 400 }
    );
  }

  if (content.length < 10) {
    return NextResponse.json(
      { error: 'content is required and must be at least 10 characters' },
      { status: 400 }
    );
  }

  const systemPrompt = SECTION_PROMPTS[section];
  const userPrompt = `Analyze this profile section and return only the JSON object.\n\n---\n${content.slice(0, 8000)}\n---`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json(
        { error: 'AI optimization failed: ' + (err || res.statusText) },
        { status: 502 }
      );
    }

    const data = await res.json();
    const text = (data.content?.[0] as { text?: string })?.text;
    if (!text) {
      return NextResponse.json({ error: 'AI returned no content' }, { status: 502 });
    }

    const raw = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed = JSON.parse(raw) as { suggestions?: string[]; score?: number; reasoning?: string };

    const suggestions = Array.isArray(parsed.suggestions)
      ? parsed.suggestions.filter((s): s is string => typeof s === 'string')
      : [];
    const score =
      typeof parsed.score === 'number'
        ? Math.max(0, Math.min(100, Math.round(parsed.score)))
        : 50;
    const reasoning =
      typeof parsed.reasoning === 'string' && parsed.reasoning.trim()
        ? parsed.reasoning.trim()
        : '';

    return NextResponse.json({ suggestions, score, reasoning });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Optimization failed';
    if (/JSON|parse/i.test(message)) {
      return NextResponse.json(
        { error: 'AI response was not valid. Try again.' },
        { status: 502 }
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
