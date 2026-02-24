import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireApiAuth } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

const raw = process.env.RESUME_WORKER_URL?.trim();
const RESUME_WORKER_URL = raw && !raw.includes(':3000') ? raw : 'http://127.0.0.1:3001';

// GET — list tailored resumes for a candidate+job pair
export async function GET(req: NextRequest) {
  const authResult = await requireApiAuth(req, { roles: ['admin', 'recruiter', 'candidate'] });
  if (authResult instanceof Response) return authResult;
  
  const candidateId = req.nextUrl.searchParams.get('candidate_id');
  const jobId = req.nextUrl.searchParams.get('job_id');
  
  if (!candidateId) return NextResponse.json({ error: 'candidate_id required' }, { status: 400 });
  
  const supabase = createServiceClient();
  
  // If candidate, ensure they own this record
  if (authResult.profile.role === 'candidate') {
    const { data: c } = await supabase.from('candidates').select('id').eq('id', candidateId).eq('user_id', authResult.user.id).single();
    if (!c) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  
  let query = supabase
    .from('resume_versions')
    .select('*, job:jobs(title, company)')
    .eq('candidate_id', candidateId)
    .order('created_at', { ascending: false });
    
  if (jobId) {
    query = query.eq('job_id', jobId);
  }
  
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tailored_resumes: data || [] });
}

// POST — trigger resume tailoring for a job match
export async function POST(req: NextRequest) {
  // Only admins and recruiters can trigger tailoring (candidates cannot).
  const authResult = await requireApiAuth(req, { roles: ['admin', 'recruiter'] });
  if (authResult instanceof Response) return authResult;
  
  let body: { candidate_id?: string; job_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  
  const { candidate_id, job_id } = body || {};
  if (!candidate_id || !job_id) {
    return NextResponse.json({ error: 'candidate_id and job_id required' }, { status: 400 });
  }
  
  const supabase = createServiceClient();
  
  // Access control: recruiter must be assigned to the candidate; admins always allowed.
  if (authResult.profile.role === 'recruiter') {
    const { data: a } = await supabase
      .from('recruiter_candidate_assignments')
      .select('recruiter_id')
      .eq('candidate_id', candidate_id)
      .eq('recruiter_id', authResult.profile.id)
      .maybeSingle();
    if (!a) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Only recruiters with admin-granted permission can use tailoring (admins always allowed).
  if (authResult.profile.role === 'recruiter') {
    const { data: profile } = await supabase
      .from('profiles')
      .select('resume_generation_allowed')
      .eq('id', authResult.profile.id)
      .single();
    if (profile?.resume_generation_allowed !== true) {
      return NextResponse.json(
        { error: 'Resume tailoring is not enabled for your account. Ask an admin to grant access.' },
        { status: 403 },
      );
    }
  }
  
  // Check match exists
  const { data: match } = await supabase
    .from('candidate_job_matches')
    .select('fit_score')
    .eq('candidate_id', candidate_id)
    .eq('job_id', job_id)
    .single();
  if (!match) {
    return NextResponse.json({ error: 'No match found for this candidate and job' }, { status: 404 });
  }
  const fitScore = match.fit_score ?? null;
  if (fitScore !== null && fitScore >= 75) {
    return NextResponse.json(
      { error: 'Resume tailoring is only available for matches with ATS score below 75.' },
      { status: 400 },
    );
  }
  
  // Check if already generating
  const { data: existing } = await supabase
    .from('resume_versions')
    .select('id, generation_status')
    .eq('candidate_id', candidate_id)
    .eq('job_id', job_id)
    .in('generation_status', ['pending', 'generating', 'compiling', 'uploading'])
    .single();
  if (existing) {
    return NextResponse.json({ error: 'A tailored resume is already being generated for this job', resume_version_id: existing.id }, { status: 409 });
  }
  
  // Fetch candidate + job
  const [{ data: candidate, error: cErr }, { data: job, error: jErr }] = await Promise.all([
    supabase.from('candidates').select('*').eq('id', candidate_id).single(),
    supabase.from('jobs').select('*').eq('id', job_id).single(),
  ]);
  if (cErr || !candidate) return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
  if (jErr || !job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  
  // Count existing versions
  const { count: versionCount } = await supabase
    .from('resume_versions')
    .select('id', { count: 'exact', head: true })
    .eq('candidate_id', candidate_id)
    .eq('job_id', job_id);
  
  const versionNumber = (versionCount || 0) + 1;
  const pdfPath = `generated/${candidate_id}/${job_id}/v${versionNumber}.pdf`;
  
  // Create resume_version record
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
  
  // Check worker health
  let workerReachable = false;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const healthRes = await fetch(`${RESUME_WORKER_URL}/health`, { signal: controller.signal });
    clearTimeout(timeout);
    workerReachable = healthRes.ok;
  } catch {
    // Worker not reachable
  }
  
  if (!workerReachable) {
    await supabase.from('resume_versions').update({
      generation_status: 'failed',
      error_message: 'Resume worker unreachable. Please try again later.',
    }).eq('id', resumeVersion.id);
    return NextResponse.json({ error: 'Resume tailoring service is not available. Please try again later.' }, { status: 503 });
  }
  
  // Fire-and-forget to worker
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
    supabase.from('resume_versions').update({
      generation_status: 'failed',
      error_message: 'Worker call failed: ' + err.message,
    }).eq('id', resumeVersion.id);
  });
  
  return NextResponse.json({
    resume_version_id: resumeVersion.id,
    status: 'pending',
    message: 'Resume tailoring started. This usually takes 30-60 seconds.',
  });
}
