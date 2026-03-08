/**
 * POST /api/ats/interview-kit
 *
 * Claude-powered interview question suggestions based on JD + resume gaps.
 * Uses deterministic score breakdown — Claude writes questions only, never scores.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth, canAccessCandidate } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';
import { hasFeature } from '@/lib/feature-flags-server';
import { error as logError } from '@/lib/logger';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req, { roles: ['admin', 'recruiter'] });
  if (auth instanceof Response) return auth;

  const service = createServiceClient();
  if (auth.profile.role === 'recruiter') {
    const canUse = await hasFeature(service, auth.user.id, 'recruiter', 'recruiter_run_ats_check', true);
    if (!canUse) return NextResponse.json({ error: 'ATS check access is restricted' }, { status: 403 });
  }

  if (!ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'AI service unavailable' }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const candidateId = String(body.candidate_id || '');
  const jobId = String(body.job_id || '');

  if (!candidateId || !jobId) {
    return NextResponse.json({ error: 'candidate_id and job_id required' }, { status: 400 });
  }

  const allowed = await canAccessCandidate(auth, candidateId, service);
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const [{ data: candidate }, { data: job }, { data: match }] = await Promise.all([
    service.from('candidates').select('primary_title, skills, experience').eq('id', candidateId).single(),
    service.from('jobs').select('title, jd_clean, jd_raw').eq('id', jobId).single(),
    service.from('candidate_job_matches').select('ats_breakdown, missing_keywords, matched_keywords').eq('candidate_id', candidateId).eq('job_id', jobId).maybeSingle(),
  ]);

  if (!candidate || !job) {
    return NextResponse.json({ error: 'Candidate or job not found' }, { status: 404 });
  }

  const jd = (job.jd_clean || job.jd_raw || '').slice(0, 2000);
  const missing = (match?.missing_keywords as string[] | undefined) || [];
  const title = candidate.primary_title || 'Candidate';
  const bullets = (candidate.experience as any[])?.flatMap((e: any) => e.responsibilities || []).filter(Boolean).slice(0, 10) || [];

  const prompt = `You are preparing an interview kit for a hiring manager. Generate 5–7 focused interview questions.

JOB: ${job.title}
JD (excerpt): ${jd.slice(0, 1200)}

CANDIDATE: ${title}
Resume highlights: ${bullets.slice(0, 5).map((b: string) => b.slice(0, 80)).join(' | ')}

${missing.length > 0 ? `Gaps to probe: missing skills ${missing.slice(0, 5).join(', ')}` : ''}

Return ONLY valid JSON: { "questions": ["Q1?", "Q2?", ...] }
Mix: technical depth, behavioral, and gap-probing. Keep each question under 100 chars.`;

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
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      logError('[interview-kit] API error', res.status, await res.text().catch(() => ''));
      return NextResponse.json({ error: 'AI service error' }, { status: 502 });
    }

    const data = await res.json();
    const text = data.content?.[0]?.text || '';
    const match2 = text.match(/\{[\s\S]*\}/);
    const parsed = match2 ? JSON.parse(match2[0]) : { questions: [] };
    const questions = Array.isArray(parsed.questions) ? parsed.questions : [];

    return NextResponse.json({
      job_title: job.title,
      candidate_title: title,
      questions: questions.slice(0, 7),
    });
  } catch (e) {
    logError('[interview-kit] failed', e);
    return NextResponse.json({ error: 'Interview kit generation failed' }, { status: 500 });
  }
}
