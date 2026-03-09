/**
 * POST /api/candidate/resume/check-ats
 * Body: { resume_id: string; job_id?: string; jd_text?: string }
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';
import { runAtsCheckPasted } from '@/lib/matching';
import { calculateGenericAtsScore } from '@/lib/resume-ats-score';

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

  const jobId = body.job_id || undefined;
  const jdText = body.jd_text || '';

  if (jobId) {
    const { data: job } = await supabase.from('jobs').select('id, title, jd_raw, jd_clean').eq('id', jobId).single();
    const jd = (job?.jd_clean || job?.jd_raw || '').trim();
    if (jd) {
      try {
        const result = await runAtsCheckPasted(supabase, candidate.id, jd, resumeId);
        await supabase.from('resume_ats_checks').insert({
          resume_id: resumeId,
          job_id: jobId,
          ats_score: result.ats_score,
          keyword_matches: result.matched_keywords ?? [],
          keyword_misses: result.missing_keywords ?? [],
          formatting_issues: [],
          recommendations: (result.ats_breakdown as any)?.fix_report?.recommendations?.map((r: any) => r.action) ?? [],
        });
        return NextResponse.json({
          score: result.ats_score,
          breakdown: result.ats_breakdown,
          recommendations: (result.ats_breakdown as any)?.fix_report?.recommendations ?? [],
          matched_keywords: result.matched_keywords ?? [],
          missing_keywords: result.missing_keywords ?? [],
        });
      } catch (e: any) {
        return NextResponse.json({ error: e?.message || 'ATS check failed' }, { status: 500 });
      }
    }
  }

  if (jdText.trim()) {
    try {
      const result = await runAtsCheckPasted(supabase, candidate.id, jdText.trim(), resumeId);
      await supabase.from('resume_ats_checks').insert({
        resume_id: resumeId,
        job_id: null,
        ats_score: result.ats_score,
        keyword_matches: result.matched_keywords ?? [],
        keyword_misses: result.missing_keywords ?? [],
        formatting_issues: [],
        recommendations: (result.ats_breakdown as any)?.fix_report?.recommendations?.map((r: any) => r.action) ?? [],
      });
      return NextResponse.json({
        score: result.ats_score,
        breakdown: result.ats_breakdown,
        recommendations: (result.ats_breakdown as any)?.fix_report?.recommendations ?? [],
        matched_keywords: result.matched_keywords ?? [],
        missing_keywords: result.missing_keywords ?? [],
      });
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || 'ATS check failed' }, { status: 500 });
    }
  }

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

  const generic = calculateGenericAtsScore(parsedText);
  return NextResponse.json({
    score: generic.score,
    breakdown: generic.breakdown,
    recommendations: generic.recommendations,
    matched_keywords: generic.breakdown.keywords.matched,
    missing_keywords: generic.breakdown.keywords.missing,
  });
}
