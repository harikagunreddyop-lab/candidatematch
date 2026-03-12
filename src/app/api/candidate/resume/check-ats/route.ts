/**
 * POST /api/candidate/resume/check-ats
 * Body: { resume_id: string; job_id?: string; jd_text?: string }
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req, { effectiveRoles: ['candidate'] });
  if (auth instanceof Response) return auth;

  const supabase = createServiceClient();
  const { data: candidate } = await supabase
    .from('candidates')
    .select('id')
    .eq('user_id', auth.user.id)
    .single();

  if (!candidate) {
    return NextResponse.json({ error: 'Candidate profile not found' }, { status: 404 });
  }

  let body: { resume_id: string; job_id?: string; jd_text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const resumeId = body.resume_id;
  if (!resumeId) {
    return NextResponse.json({ error: 'resume_id is required' }, { status: 400 });
  }

  const { data: resume, error: resumeErr } = await supabase
    .from('candidate_resumes')
    .select('id, candidate_id, parsed_text, ats_feedback')
    .eq('id', resumeId)
    .eq('candidate_id', candidate.id)
    .single();

  if (resumeErr || !resume) {
    return NextResponse.json({ error: 'Resume not found' }, { status: 404 });
  }

  // TODO: ATS scoring replaced — rewire to new engine at src/lib/ats/

  const parsedText = (resume.parsed_text || '').trim();
  if (!parsedText) {
    return NextResponse.json({
      score: (resume.ats_feedback as any)?.score ?? 0,
      breakdown: resume.ats_feedback ?? {},
      recommendations: (resume.ats_feedback as any)?.recommendations ?? [],
      matched_keywords: [],
      missing_keywords: [],
    });
  }

  return NextResponse.json({
    score: (resume.ats_feedback as any)?.score ?? 0,
    breakdown: resume.ats_feedback ?? {},
    recommendations: (resume.ats_feedback as any)?.recommendations ?? [],
    matched_keywords: [],
    missing_keywords: [],
  });
}
