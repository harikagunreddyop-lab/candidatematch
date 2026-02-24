// =============================================================================
// DESTINATION: src/app/api/candidate-resumes/route.ts
// =============================================================================
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireApiAuth } from '@/lib/api-auth';
import { runMatching } from '@/lib/matching';

export const dynamic = 'force-dynamic';

const MAX_RESUMES_PER_CANDIDATE = 5;
const MAX_FILE_SIZE_MB = 10;
const BUCKET = 'resumes'; // Must match the bucket in 001_initial.sql

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

// ── GET — list resumes OR download a specific resume ────────────────────────
export async function GET(req: NextRequest) {
  const resumeId = req.nextUrl.searchParams.get('resume_id');
  const candidateId = req.nextUrl.searchParams.get('candidate_id');

  const supabase = createServiceClient();

  // Download a single resume as PDF
  if (resumeId) {
    const { data: resume, error } = await supabase
      .from('candidate_resumes')
      .select('candidate_id, file_name, pdf_path')
      .eq('id', resumeId)
      .single();

    if (error || !resume) {
      return NextResponse.json({ error: 'Resume not found' }, { status: 404 });
    }

    const forbidden = await assertCanAccessCandidate(req, resume.candidate_id);
    if (forbidden) return forbidden;

    const { data: file, error: storageError } = await supabase.storage.from(BUCKET).download(resume.pdf_path);
    if (!file || storageError) {
      return NextResponse.json({ error: 'Failed to download resume' }, { status: 500 });
    }

    const fileName = resume.file_name || 'resume.pdf';
    return new NextResponse(file, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
      },
    });
  }

  // List resumes for a candidate
  if (!candidateId) return NextResponse.json({ error: 'candidate_id required' }, { status: 400 });

  const forbidden = await assertCanAccessCandidate(req, candidateId);
  if (forbidden) return forbidden;

  const { data, error } = await supabase
    .from('candidate_resumes')
    .select('*')
    .eq('candidate_id', candidateId)
    .order('uploaded_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ resumes: data || [] });
}

// ── POST — upload a new resume PDF ───────────────────────────────────────────
export async function POST(req: NextRequest) {
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

  const forbidden = await assertCanAccessCandidate(req, candidateId);
  if (forbidden) return forbidden;

  const supabase = createServiceClient();

  if (file.type !== 'application/pdf') {
    return NextResponse.json({ error: 'Only PDF files are allowed' }, { status: 400 });
  }

  const fileSizeMB = file.size / (1024 * 1024);
  if (fileSizeMB > MAX_FILE_SIZE_MB) {
    return NextResponse.json({ error: `File too large. Max ${MAX_FILE_SIZE_MB}MB.` }, { status: 400 });
  }

  // Check current resume count
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

  // Build storage path
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${candidateId}/${Date.now()}_${safeName}`;

  // Upload to storage
  const arrayBuffer = await file.arrayBuffer();
  const { data: storageData, error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, arrayBuffer, {
      contentType: 'application/pdf',
      upsert: false,
    });

  if (uploadError || !storageData?.path) {
    // Log for debugging; do not expose internal paths
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.error('[candidate-resumes] Storage upload failed:', uploadError?.message);
    }
    return NextResponse.json(
      { error: 'Storage upload failed: ' + (uploadError?.message || 'unknown error') },
      { status: 500 }
    );
  }

  const confirmedPath = storageData.path;

  // Insert DB record
  const { data, error: dbError } = await supabase
    .from('candidate_resumes')
    .insert({
      candidate_id: candidateId,
      label,
      pdf_path: confirmedPath,
      file_name: file.name,
      file_size: file.size,
      uploaded_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (dbError) {
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.error('[candidate-resumes] DB insert failed, rolling back storage:', dbError.message);
    }
    await supabase.storage.from(BUCKET).remove([confirmedPath]);
    return NextResponse.json({ error: 'DB insert failed: ' + dbError.message }, { status: 500 });
  }

  // Clear cached parsed text so matching uses fresh resume set
  await supabase
    .from('candidates')
    .update({ parsed_resume_text: null })
    .eq('id', candidateId);

  // Run matching for this candidate so new resume is scored and best-match per job is updated (fire-and-forget)
  runMatching(candidateId).catch(() => {
    // Background matching failure is non-blocking; no user-facing error
  });

  return NextResponse.json({ resume: data });
}

// ── DELETE — remove a resume ──────────────────────────────────────────────────
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

  if (fetchError || !resume) {
    return NextResponse.json({ error: 'Resume not found' }, { status: 404 });
  }

  const forbidden = await assertCanAccessCandidate(req, resume.candidate_id);
  if (forbidden) return forbidden;

  // Delete from storage
  const { error: storageError } = await supabase.storage
    .from(BUCKET)
    .remove([resume.pdf_path]);

  if (storageError) {
    // Storage delete failed but DB delete may have succeeded; continue
  }

  // Delete DB record
  const { error } = await supabase
    .from('candidate_resumes')
    .delete()
    .eq('id', resume_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}