import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireApiAuth, canAccessCandidate } from '@/lib/api-auth';
import { isValidUuid } from '@/lib/security';
import { ATSScorer } from '@/lib/ats/scorer';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_RESUME_TEXT_LEN = 12000;

async function getResumeText(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  resumeId: string,
  candidateId: string
): Promise<string> {
  const { data: r, error } = await supabase
    .from('candidate_resumes')
    .select('id, pdf_path')
    .eq('id', resumeId)
    .eq('candidate_id', candidateId)
    .single();

  if (error || !r?.pdf_path) return '';

  try {
    const { data } = await supabase.storage.from('resumes').download(r.pdf_path);
    if (!data) return '';
    const arrayBuffer = await data.arrayBuffer();
    const { extractText } = await import('unpdf');
    const { text } = await extractText(new Uint8Array(arrayBuffer), { mergePages: true });
    return (text || '').slice(0, MAX_RESUME_TEXT_LEN);
  } catch {
    return '';
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req, { effectiveRoles: ['platform_admin', 'company_admin', 'recruiter', 'candidate'] });
  if (auth instanceof Response) return auth;

  let body: { resume_id?: string; job_id?: string; candidate_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const resumeId = body.resume_id ? String(body.resume_id).trim() : '';
  const jobId = body.job_id ? String(body.job_id).trim() : '';
  const candidateIdParam = body.candidate_id ? String(body.candidate_id).trim() : '';

  if (!resumeId || !jobId) {
    return NextResponse.json(
      { error: 'resume_id and job_id are required' },
      { status: 400 }
    );
  }
  if (!isValidUuid(resumeId) || !isValidUuid(jobId)) {
    return NextResponse.json({ error: 'Invalid resume_id or job_id' }, { status: 400 });
  }

  const supabase = createServiceClient();

  const [{ data: resumeRow }, { data: job }] = await Promise.all([
    supabase
      .from('candidate_resumes')
      .select('id, candidate_id')
      .eq('id', resumeId)
      .single(),
    supabase.from('jobs').select('id, jd_clean, jd_raw').eq('id', jobId).single(),
  ]);

  if (!resumeRow) return NextResponse.json({ error: 'Resume not found' }, { status: 404 });
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

  const candidateId = resumeRow.candidate_id;
  const allowed = await canAccessCandidate(auth, candidateId, supabase);
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  if (candidateIdParam && candidateIdParam !== candidateId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const jobDescription = (job.jd_clean || job.jd_raw || '').trim();
  if (!jobDescription) {
    return NextResponse.json({ error: 'Job has no description' }, { status: 400 });
  }

  const resumeText = await getResumeText(supabase, resumeId, candidateId);
  if (!resumeText.trim()) {
    return NextResponse.json(
      { error: 'Could not extract text from resume. Upload a PDF with selectable text.' },
      { status: 400 }
    );
  }

  try {
    const scorer = new ATSScorer();
    const result = await scorer.optimizeResume(resumeText, jobDescription);
    const optimizedText = result.optimized ?? result.resume ?? resumeText;

    const placeholderPath = `ats_optimized/${candidateId}/${randomUUID()}.txt`;
    const { data: version, error: insertErr } = await supabase
      .from('resume_versions')
      .insert({
        candidate_id: candidateId,
        job_id: jobId,
        pdf_path: placeholderPath,
        resume_text: optimizedText,
        generation_status: 'completed',
        version_number: 1,
      })
      .select('id, created_at')
      .single();

    if (insertErr) {
      return NextResponse.json(
        { error: 'Failed to save optimized version: ' + insertErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      resume_version_id: version?.id,
      score: result.score,
      changes: result.changes,
      already_optimal: result.score.overall_score >= 90 && result.changes.length === 0,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Optimization failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
