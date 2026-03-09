/**
 * GET /api/candidate/saved-jobs — List saved job IDs (and job details).
 * POST /api/candidate/saved-jobs — Save a job (body: job_id).
 * DELETE /api/candidate/saved-jobs — Unsave (body: job_id).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(req, { effectiveRoles: ['candidate'] });
  if (auth instanceof Response) return auth;

  const supabase = createServiceClient();
  const { data: candidate } = await supabase
    .from('candidates')
    .select('id')
    .eq('user_id', auth.user.id)
    .single();

  if (!candidate) {
    return NextResponse.json({ saved_job_ids: [], saved_jobs: [] });
  }

  const { data: rows, error } = await supabase
    .from('candidate_saved_jobs')
    .select('job_id, created_at, job:jobs(id, title, company, location, remote_type, salary_min, salary_max, url)')
    .eq('candidate_id', candidate.id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const saved_job_ids = (rows ?? []).map((r: any) => r.job_id);
  const saved_jobs = (rows ?? []).map((r: any) => ({ job_id: r.job_id, created_at: r.created_at, job: r.job }));
  return NextResponse.json({ saved_job_ids, saved_jobs });
}

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

  const body = await req.json().catch(() => ({}));
  const jobId = body.job_id;
  if (!jobId) return NextResponse.json({ error: 'job_id required' }, { status: 400 });

  const { error } = await supabase.from('candidate_saved_jobs').upsert(
    { candidate_id: candidate.id, job_id: jobId, created_at: new Date().toISOString() },
    { onConflict: 'candidate_id,job_id' }
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireApiAuth(req, { effectiveRoles: ['candidate'] });
  if (auth instanceof Response) return auth;

  const supabase = createServiceClient();
  const { data: candidate } = await supabase
    .from('candidates')
    .select('id')
    .eq('user_id', auth.user.id)
    .single();

  if (!candidate) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const jobId = body.job_id;
  if (!jobId) return NextResponse.json({ error: 'job_id required' }, { status: 400 });

  const { error } = await supabase
    .from('candidate_saved_jobs')
    .delete()
    .eq('candidate_id', candidate.id)
    .eq('job_id', jobId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
