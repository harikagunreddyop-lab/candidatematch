/**
 * GET /api/candidate/resume — List current candidate's resumes.
 * PATCH /api/candidate/resume — Update resume (set_default, version_name, tags).
 * DELETE /api/candidate/resume — Delete a resume (body: resume_id).
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
    .select('id, salary_min, salary_max')
    .eq('user_id', auth.user.id)
    .single();

  if (!candidate) {
    return NextResponse.json({ error: 'Candidate profile not found' }, { status: 404 });
  }

  const { data, error } = await supabase
    .from('candidate_resumes')
    .select('*')
    .eq('candidate_id', candidate.id)
    .order('uploaded_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    resumes: data ?? [],
    candidate_id: candidate.id,
    candidate_salary_min: candidate.salary_min ?? null,
    candidate_salary_max: candidate.salary_max ?? null,
  });
}

export async function PATCH(req: NextRequest) {
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

  let body: { resume_id: string; is_default?: boolean; version_name?: string; tags?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.resume_id) {
    return NextResponse.json({ error: 'resume_id is required' }, { status: 400 });
  }

  const { data: resume } = await supabase
    .from('candidate_resumes')
    .select('id')
    .eq('id', body.resume_id)
    .eq('candidate_id', candidate.id)
    .single();

  if (!resume) {
    return NextResponse.json({ error: 'Resume not found' }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};
  if (body.is_default === true) {
    await supabase
      .from('candidate_resumes')
      .update({ is_default: false })
      .eq('candidate_id', candidate.id);
    updates.is_default = true;
  }
  if (body.version_name !== undefined) updates.version_name = body.version_name || null;
  if (Array.isArray(body.tags)) updates.tags = body.tags;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ success: true });
  }

  const { error } = await supabase
    .from('candidate_resumes')
    .update(updates)
    .eq('id', body.resume_id)
    .eq('candidate_id', candidate.id);

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
    return NextResponse.json({ error: 'Candidate profile not found' }, { status: 404 });
  }

  let body: { resume_id: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.resume_id) {
    return NextResponse.json({ error: 'resume_id is required' }, { status: 400 });
  }

  const { data: resume, error: fetchErr } = await supabase
    .from('candidate_resumes')
    .select('id, pdf_path')
    .eq('id', body.resume_id)
    .eq('candidate_id', candidate.id)
    .single();

  if (fetchErr || !resume) {
    return NextResponse.json({ error: 'Resume not found' }, { status: 404 });
  }

  await supabase.storage.from('resumes').remove([resume.pdf_path]);
  const { error } = await supabase
    .from('candidate_resumes')
    .delete()
    .eq('id', body.resume_id)
    .eq('candidate_id', candidate.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
