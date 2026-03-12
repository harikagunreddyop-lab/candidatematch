/**
 * POST /api/candidate/resume/optimize
 * Body: { resume_id: string; target_job_id?: string; focus_area?: 'keywords' | 'impact' | 'formatting' | 'all' }
 * Returns: optimized_sections[], new_ats_score
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';
import { error as logError } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';

type FocusArea = 'keywords' | 'impact' | 'formatting' | 'all';

export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req, { effectiveRoles: ['candidate'] });
  if (auth instanceof Response) return auth;

  if (!ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'AI optimization is not configured' }, { status: 503 });
  }

  const supabase = createServiceClient();
  const { data: candidate } = await supabase
    .from('candidates')
    .select('id')
    .eq('user_id', auth.user.id)
    .single();

  if (!candidate) {
    return NextResponse.json({ error: 'Candidate profile not found' }, { status: 404 });
  }

  let body: { resume_id: string; target_job_id?: string; focus_area?: FocusArea };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const resumeId = body.resume_id;
  const focusArea: FocusArea = body.focus_area || 'all';
  if (!resumeId) {
    return NextResponse.json({ error: 'resume_id is required' }, { status: 400 });
  }

  const { data: resume, error: resumeErr } = await supabase
    .from('candidate_resumes')
    .select('id, candidate_id, parsed_text, ats_score')
    .eq('id', resumeId)
    .eq('candidate_id', candidate.id)
    .single();

  if (resumeErr || !resume) {
    return NextResponse.json({ error: 'Resume not found' }, { status: 404 });
  }

  const parsedText = (resume.parsed_text || '').trim();
  if (!parsedText) {
    return NextResponse.json(
      { error: 'Resume text not available. Re-upload the resume to enable optimization.' },
      { status: 400 }
    );
  }

  let jobContext = '';
  if (body.target_job_id) {
    const { data: job } = await supabase
      .from('jobs')
      .select('title, jd_clean, jd_raw, must_have_skills')
      .eq('id', body.target_job_id)
      .single();
    if (job) {
      const jd = (job.jd_clean || job.jd_raw || '').slice(0, 2000);
      const skills = (job.must_have_skills || []).slice(0, 15).join(', ');
      jobContext = `\nTARGET ROLE: ${job.title}\nKEY SKILLS TO REFLECT: ${skills}\nJOB DESCRIPTION (excerpt):\n${jd}`;
    }
  }

  const focusInstructions: Record<FocusArea, string> = {
    keywords: 'Focus on weaving in relevant keywords and skills from the job description. Keep wording natural.',
    impact: 'Focus on rewriting bullets for maximum impact: strong action verbs, quantifiable results (%, numbers, scale), and clear outcomes.',
    formatting: 'Focus on ATS-friendly formatting: clear section headers, consistent bullet style, scannable structure. Suggest concrete edits.',
    all: 'Improve keywords, impact (action verbs + metrics), and ATS-friendly formatting. Prioritize clarity and relevance.',
  };

  const systemPrompt = `You are an expert resume coach and ATS specialist. Analyze the resume and return JSON only.

Rules:
- Return a JSON array of objects: { "section": "Section name", "original": "exact snippet", "optimized": "improved version", "improvement_score": 0-100, "reasoning": "brief why" }
- Section names: "Summary", "Experience", "Skills", "Education", or "Other"
- For "original" use exact short snippets from the resume (1-2 sentences or 1 bullet)
- For "optimized" provide the improved text (ATS-friendly, impact-focused)
- improvement_score: how much better the optimized version is (0-100)
- Keep each optimized snippet under 150 words
${jobContext ? '\nUse the TARGET ROLE and KEY SKILLS to tailor suggestions.' : ''}`;

  const userPrompt = `RESUME TEXT:\n${parsedText.slice(0, 6000)}\n\n${focusInstructions[focusArea]}\n\nReturn ONLY a JSON array of optimization suggestions. No markdown, no explanation outside JSON.`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      logError('[resume/optimize] Claude error', res.status, errText);
      return NextResponse.json({ error: 'AI service error' }, { status: 502 });
    }

    const data = await res.json();
    const text = (data.content?.[0]?.text || '').trim();
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    const rawSections = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    const optimizedSections = Array.isArray(rawSections)
      ? rawSections
          .filter(
            (s: any) =>
              s && typeof s.section === 'string' && typeof s.optimized === 'string'
          )
          .map((s: any) => ({
            section: s.section || 'Other',
            original: s.original || '',
            optimized: s.optimized || '',
            improvement_score: typeof s.improvement_score === 'number' ? s.improvement_score : 70,
            reasoning: s.reasoning || '',
          }))
          .slice(0, 10)
      : [];

    return NextResponse.json({
      optimized_sections: optimizedSections,
      // TODO: ATS scoring replaced — rewire to new engine at src/lib/ats/
      new_ats_score: null,
      recommendations: [],
    });
  } catch (e) {
    logError('[resume/optimize] failed', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Optimization failed' },
      { status: 500 }
    );
  }
}
