import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireApiAuth, canAccessCandidate } from '@/lib/api-auth';
import { hasFeature } from '@/lib/feature-flags-server';

export const dynamic = 'force-dynamic';

const MAX_RESUMES_PER_CANDIDATE = 5;
const MAX_FILE_SIZE_MB = 10;

const RESUME_GENERATION_MIN_SCORE = 61;
const RESUME_GENERATION_MAX_SCORE = 79; // Tailor only for scores 61-79

async function assertCanAccessCandidate(req: NextRequest, candidateId: string): Promise<NextResponse | null> {
  const authResult = await requireApiAuth(req, { effectiveRoles: ['platform_admin', 'company_admin', 'recruiter', 'candidate'] });
  if (authResult instanceof Response) return authResult;
  const supabase = createServiceClient();
  if (authResult.profile.role === 'admin') return null;
  if (authResult.profile.role === 'candidate') {
    const { data: c } = await supabase.from('candidates').select('id').eq('id', candidateId).eq('user_id', authResult.user.id).single();
    if (!c) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    return null;
  }
  const ok = await canAccessCandidate(authResult, candidateId, supabase);
  if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return null;
}

/** Recruiters need admin-granted access to resume generation (profile or user_feature_flags). */
async function assertResumeGenerationAllowed(req: NextRequest): Promise<NextResponse | null> {
  const authResult = await requireApiAuth(req, { effectiveRoles: ['platform_admin', 'company_admin', 'recruiter'] });
  if (authResult instanceof Response) return authResult;
  if (authResult.profile.role === 'admin') return null;
  const supabase = createServiceClient();
  const fromFlags = await hasFeature(supabase, authResult.profile.id, 'recruiter', 'resume_generation_allowed', false);
  const { data: profile } = await supabase.from('profiles').select('resume_generation_allowed').eq('id', authResult.profile.id).single();
  const allowed = fromFlags || profile?.resume_generation_allowed === true;
  if (!allowed) {
    return NextResponse.json(
      { error: 'Resume generation is not enabled for your account. Ask an admin to grant access.' },
      { status: 403 }
    );
  }
  return null;
}

// ── GET — list candidate_resumes for a candidate ─────────────────────────────
export async function GET(req: NextRequest) {
  const candidateId = req.nextUrl.searchParams.get('candidate_id');
  if (!candidateId) return NextResponse.json({ error: 'candidate_id required' }, { status: 400 });

  const forbidden = await assertCanAccessCandidate(req, candidateId);
  if (forbidden) return forbidden;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('candidate_resumes')
    .select('*')
    .eq('candidate_id', candidateId)
    .order('uploaded_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ resumes: data || [] });
}

// ── POST — two modes:
//   1. JSON body { candidate_id, job_id }  → generate AI resume via worker
//   2. FormData { file, candidate_id, label } → upload a PDF directly
export async function POST(req: NextRequest) {
  const contentType = req.headers.get('content-type') || '';

  // ── MODE 1: Resume Generation (v3: content-first + cache) ──────────────────
  if (contentType.includes('application/json')) {
    let body: { candidate_id?: string; job_id?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const { candidate_id, job_id } = body || {};

    if (!candidate_id || !job_id) {
      return NextResponse.json({ error: 'candidate_id and job_id are required' }, { status: 400 });
    }

    const forbidden = await assertCanAccessCandidate(req, candidate_id);
    if (forbidden) return forbidden;
    const resumeAllowed = await assertResumeGenerationAllowed(req);
    if (resumeAllowed) return resumeAllowed;

    const supabase = createServiceClient();

    // Enforce: resume generation only for matches with score 61-79
    const { data: match } = await supabase
      .from('candidate_job_matches')
      .select('ats_score, fit_score')
      .eq('candidate_id', candidate_id)
      .eq('job_id', job_id)
      .single();
    const score = match?.ats_score ?? match?.fit_score ?? null;
    if (score !== null) {
      if (score < RESUME_GENERATION_MIN_SCORE) {
        return NextResponse.json(
          { error: `Resume generation is only available for matches with ATS score 61-79. This match has score ${score}.` },
          { status: 400 },
        );
      }
      if (score > RESUME_GENERATION_MAX_SCORE) {
        return NextResponse.json(
          { error: `Resume generation is only for scores 61-79. This match scores ${score} — apply directly.` },
          { status: 400 },
        );
      }
    }

    // Fetch candidate + job
    const [{ data: candidate, error: cErr }, { data: job, error: jErr }] = await Promise.all([
      supabase.from('candidates').select('*').eq('id', candidate_id).single(),
      supabase.from('jobs').select('*').eq('id', job_id).single(),
    ]);
    if (cErr || !candidate) return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
    if (jErr || !job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

    // ── v3: Compute content hash for caching ──
    const { computeContentHash } = await import('@/lib/resume-hash');
    const templateId = 'ats-classic';
    const contentHash = computeContentHash({
      candidateId: candidate_id,
      skills: candidate.skills,
      experience: candidate.experience,
      education: candidate.education,
      certifications: candidate.certifications,
      jdClean: job.jd_clean || job.jd_raw || job.description || '',
      templateId,
    });

    // ── Cache check: return instantly if already rendered ──
    const { data: existing } = await supabase
      .from('resume_artifacts')
      .select('id, status, docx_url, pdf_url')
      .eq('content_hash', contentHash)
      .eq('template_id', templateId)
      .single();

    if (existing) {
      if (existing.status === 'ready') {
        return NextResponse.json({
          artifact_id: existing.id,
          status: 'ready',
          docx_url: existing.docx_url,
          pdf_url: existing.pdf_url,
          cached: true,
        });
      }
      // Still in progress — return current status
      return NextResponse.json({
        artifact_id: existing.id,
        status: existing.status,
        cached: true,
      });
    }

    // ── Generate content via coverage gate + LLM rewrite ──
    const { generateContent } = await import('@/lib/resume-content');
    const { content, coverage } = await generateContent(candidate, job);

    // Enrich content with candidate name + contact for the renderer
    const enrichedContent = {
      ...content,
      candidateName: candidate.full_name,
      contactLine: [candidate.email, candidate.phone, candidate.location].filter(Boolean).join(' | '),
    };

    // ── Store artifact row ──
    const { data: artifact, error: artErr } = await supabase
      .from('resume_artifacts')
      .insert({
        candidate_id,
        job_id,
        template_id: templateId,
        content_hash: contentHash,
        content_json: enrichedContent,
        coverage_json: coverage,
        status: 'queued',
      })
      .select('id')
      .single();

    if (artErr || !artifact) {
      return NextResponse.json({ error: 'Failed to create artifact: ' + artErr?.message }, { status: 500 });
    }

    // ── Enqueue render job ──
    const { renderQueue } = await import('@/queue/queues');
    if (!renderQueue) {
      return NextResponse.json(
        { error: 'Rendering pipeline is not configured (Redis/queues disabled)' },
        { status: 503 },
      );
    }
    await renderQueue.add('render-job', {
      artifactId: artifact.id,
      candidateId: candidate_id,
      contentJson: enrichedContent,
      templateId,
    }, {
      attempts: 2,
      backoff: { type: 'exponential', delay: 3000 },
    });

    // Also create a resume_versions record for backward compat
    const { count: versionCount } = await supabase
      .from('resume_versions')
      .select('id', { count: 'exact', head: true })
      .eq('candidate_id', candidate_id)
      .eq('job_id', job_id);
    const versionNumber = (versionCount || 0) + 1;

    await supabase.from('resume_versions').insert({
      candidate_id,
      job_id,
      pdf_path: `generated/${candidate_id}/${artifact.id}.docx`,
      generation_status: 'pending',
      version_number: versionNumber,
      bullets: content.experience.flatMap((e) => e.bullets),
    });

    return NextResponse.json({
      artifact_id: artifact.id,
      status: 'queued',
      coverage_score: coverage.score,
      gaps_fixed: content.gapsFixed.length,
      message: 'Resume content generated. Rendering queued. Poll /api/resumes/artifacts/' + artifact.id,
    }, { status: 202 });
  }

  // ── MODE 2: Direct PDF Upload ────────────────────────────────────────────
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('file') as File | null;
  const candidateId = formData.get('candidate_id') as string | null;
  const label = (formData.get('label') as string) || 'Resume';

  if (!file || !candidateId) {
    return NextResponse.json({ error: 'file and candidate_id are required' }, { status: 400 });
  }

  const forbiddenUpload = await assertCanAccessCandidate(req, candidateId);
  if (forbiddenUpload) return forbiddenUpload;

  const supabase = createServiceClient();

  if (file.type !== 'application/pdf') {
    return NextResponse.json({ error: 'Only PDF files are allowed' }, { status: 400 });
  }

  const fileSizeMB = file.size / (1024 * 1024);
  if (fileSizeMB > MAX_FILE_SIZE_MB) {
    return NextResponse.json({ error: `File too large. Max ${MAX_FILE_SIZE_MB}MB.` }, { status: 400 });
  }

  const { count } = await supabase
    .from('candidate_resumes')
    .select('id', { count: 'exact', head: true })
    .eq('candidate_id', candidateId);

  if ((count || 0) >= MAX_RESUMES_PER_CANDIDATE) {
    return NextResponse.json(
      { error: `Maximum ${MAX_RESUMES_PER_CANDIDATE} resumes per candidate. Delete one first.` },
      { status: 400 }
    );
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${candidateId}/${Date.now()}_${safeName}`;

  const arrayBuffer = await file.arrayBuffer();
  const { data: storageData, error: uploadError } = await supabase.storage
    .from('resumes')
    .upload(storagePath, arrayBuffer, { contentType: 'application/pdf', upsert: false });

  if (uploadError || !storageData?.path) {
    return NextResponse.json({ error: 'Storage upload failed: ' + (uploadError?.message || 'unknown') }, { status: 500 });
  }

  const { data, error: dbError } = await supabase
    .from('candidate_resumes')
    .insert({
      candidate_id: candidateId,
      label,
      pdf_path: storageData.path,
      file_name: file.name,
      file_size: file.size,
      uploaded_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (dbError) {
    await supabase.storage.from('resumes').remove([storageData.path]);
    return NextResponse.json({ error: 'DB insert failed: ' + dbError.message }, { status: 500 });
  }

  // Clear parsed text cache so matcher re-reads new resume
  await supabase.from('candidates').update({ parsed_resume_text: null }).eq('id', candidateId);

  return NextResponse.json({ resume: data });
}

// ── DELETE — remove a candidate_resume ───────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const authResult = await requireApiAuth(req, { effectiveRoles: ['platform_admin', 'company_admin', 'recruiter', 'candidate'] });
  if (authResult instanceof Response) return authResult;

  const supabase = createServiceClient();
  let resume_id: string;
  try {
    const body = await req.json();
    resume_id = body.resume_id;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!resume_id) return NextResponse.json({ error: 'resume_id required' }, { status: 400 });

  const { data: resume, error: fetchError } = await supabase
    .from('candidate_resumes')
    .select('candidate_id, pdf_path')
    .eq('id', resume_id)
    .single();

  if (fetchError || !resume) return NextResponse.json({ error: 'Resume not found' }, { status: 404 });

  const forbidden = await assertCanAccessCandidate(req, resume.candidate_id);
  if (forbidden) return forbidden;

  await supabase.storage.from('resumes').remove([resume.pdf_path]);

  const { error } = await supabase.from('candidate_resumes').delete().eq('id', resume_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}