import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireApiAuth } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

const MAX_RESUMES_PER_CANDIDATE = 5;
const MAX_FILE_SIZE_MB = 10;
const raw = process.env.RESUME_WORKER_URL?.trim();
const RESUME_WORKER_URL = raw && !raw.includes(':3000') ? raw : 'http://127.0.0.1:3001';

const RESUME_GENERATION_MAX_SCORE = 75; // Only allow generation for matches with score below this

async function assertCanAccessCandidate(req: NextRequest, candidateId: string): Promise<NextResponse | null> {
  const authResult = await requireApiAuth(req, { roles: ['admin', 'recruiter', 'candidate'] });
  if (authResult instanceof Response) return authResult;
  const supabase = createServiceClient();
  if (authResult.profile.role === 'admin') return null;
  if (authResult.profile.role === 'candidate') {
    const { data: c } = await supabase.from('candidates').select('id').eq('id', candidateId).eq('user_id', authResult.user.id).single();
    if (!c) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    return null;
  }
  const { data: a } = await supabase.from('recruiter_candidate_assignments').select('recruiter_id').eq('candidate_id', candidateId).eq('recruiter_id', authResult.profile.id).single();
  if (!a) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return null;
}

/** Recruiters need admin-granted access to resume generation. */
async function assertResumeGenerationAllowed(req: NextRequest): Promise<NextResponse | null> {
  const authResult = await requireApiAuth(req, { roles: ['admin', 'recruiter'] });
  if (authResult instanceof Response) return authResult;
  if (authResult.profile.role === 'admin') return null;
  const supabase = createServiceClient();
  const { data: profile } = await supabase.from('profiles').select('resume_generation_allowed').eq('id', authResult.profile.id).single();
  if (profile?.resume_generation_allowed !== true) {
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

  // ── MODE 1: Resume Generation ────────────────────────────────────────────
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
    // Enforce: resume generation only for matches with score < 75
    const { data: match } = await supabase
      .from('candidate_job_matches')
      .select('fit_score')
      .eq('candidate_id', candidate_id)
      .eq('job_id', job_id)
      .single();
    const fitScore = match?.fit_score ?? null;
    if (fitScore !== null && fitScore >= RESUME_GENERATION_MAX_SCORE) {
      return NextResponse.json(
        { error: `Resume generation is only available for matches with score below ${RESUME_GENERATION_MAX_SCORE}. This match has score ${fitScore}.` },
        { status: 400 }
      );
    }

    // Fetch candidate + job for the worker
    const [{ data: candidate, error: cErr }, { data: job, error: jErr }] = await Promise.all([
      supabase.from('candidates').select('*').eq('id', candidate_id).single(),
      supabase.from('jobs').select('*').eq('id', job_id).single(),
    ]);

    if (cErr || !candidate) return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
    if (jErr || !job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

    // Count existing versions for this candidate+job
    const { count: versionCount } = await supabase
      .from('resume_versions')
      .select('id', { count: 'exact', head: true })
      .eq('candidate_id', candidate_id)
      .eq('job_id', job_id);

    const versionNumber = (versionCount || 0) + 1;
    const pdfPath = `generated/${candidate_id}/${job_id}/v${versionNumber}.pdf`;

    // Create the resume_version record in pending state
    const { data: resumeVersion, error: rvErr } = await supabase
      .from('resume_versions')
      .insert({
        candidate_id,
        job_id,
        pdf_path: pdfPath,
        generation_status: 'pending',
        version_number: versionNumber,
        bullets: [],
      })
      .select()
      .single();

    if (rvErr || !resumeVersion) {
      return NextResponse.json({ error: 'Failed to create resume version: ' + rvErr?.message }, { status: 500 });
    }

    // Check worker is reachable; in development optionally try to start it once
    let workerReachable = false;
    const healthController = new AbortController();
    const healthTimeout = setTimeout(() => healthController.abort(), 5000);
    try {
      const healthRes = await fetch(`${RESUME_WORKER_URL}/health`, { signal: healthController.signal });
      clearTimeout(healthTimeout);
      workerReachable = healthRes.ok;
    } catch (healthErr: any) {
      clearTimeout(healthTimeout);
      if (process.env.NODE_ENV === 'development' && typeof process !== 'undefined') {
        try {
          const { spawn } = require('child_process');
          const path = require('path');
          const workerPath = path.join(process.cwd(), 'worker', 'index.js');
          spawn(process.execPath, [workerPath], { cwd: process.cwd(), detached: true, stdio: 'ignore' }).unref();
          if (process.env.NODE_ENV === 'development') {
            console.warn('[api/resumes] Started resume worker in background. Retrying health check in 3s.');
          }
          await new Promise(r => setTimeout(r, 3000));
          const retry = await fetch(`${RESUME_WORKER_URL}/health`);
          workerReachable = retry.ok;
        } catch (_) {
          // ignore
        }
      }
    }
    if (!workerReachable) {
      await supabase.from('resume_versions').update({
        generation_status: 'failed',
        error_message: 'Resume worker unreachable.',
      }).eq('id', resumeVersion.id);
      return NextResponse.json(
        {
          error: 'Resume worker is not running. Start it with: npm run worker:dev',
          hint: process.env.NODE_ENV === 'development'
            ? 'In dev we tried to start it automatically; if it still fails, run npm run worker:dev in a separate terminal.'
            : 'Add RESUME_WORKER_URL to .env and run the worker as a separate process.',
        },
        { status: 503 }
      );
    }

    // Fire-and-forget to the worker — don't await (it's long-running)
    fetch(`${RESUME_WORKER_URL}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resume_version_id: resumeVersion.id,
        candidate,
        job,
        pdf_path: pdfPath,
      }),
    }).catch(err => {
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.error('[api/resumes] Worker call failed:', err.message);
      }
      supabase.from('resume_versions').update({
        generation_status: 'failed',
        error_message: 'Worker unreachable: ' + err.message,
      }).eq('id', resumeVersion.id);
    });

    return NextResponse.json({
      resume_version_id: resumeVersion.id,
      status: 'pending',
      message: 'Resume generation started. Refresh in a few seconds.',
    });
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
  const authResult = await requireApiAuth(req, { roles: ['admin', 'recruiter', 'candidate'] });
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