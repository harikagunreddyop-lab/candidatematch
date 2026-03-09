/**
 * GET /api/candidate/interviews/[id] — Fetch one interview.
 * PATCH /api/candidate/interviews/[id] — Update interview (notes, outcome, thank_you_sent, etc.).
 * DELETE /api/candidate/interviews/[id] — Delete interview.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireApiAuth } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

async function getCandidateId(supabase: ReturnType<typeof createServiceClient>, userId: string) {
  const { data } = await supabase
    .from('candidates')
    .select('id')
    .eq('user_id', userId)
    .single();
  return data?.id ?? null;
}

async function getInterview(
  supabase: ReturnType<typeof createServiceClient>,
  interviewId: string,
  candidateId: string
) {
  const { data, error } = await supabase
    .from('interviews')
    .select(`
      *,
      job:jobs(id, title, company, location, url),
      application:applications(id, status)
    `)
    .eq('id', interviewId)
    .eq('candidate_id', candidateId)
    .single();
  if (error || !data) return null;
  return data;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiAuth(req, { effectiveRoles: ['candidate'] });
  if (auth instanceof Response) return auth;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const supabase = createServiceClient();
  const candidateId = await getCandidateId(supabase, auth.user.id);
  if (!candidateId) return NextResponse.json({ error: 'Candidate profile not found' }, { status: 403 });

  const interview = await getInterview(supabase, id, candidateId);
  if (!interview) return NextResponse.json({ error: 'Interview not found' }, { status: 404 });
  return NextResponse.json(interview);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiAuth(req, { effectiveRoles: ['candidate'] });
  if (auth instanceof Response) return auth;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const supabase = createServiceClient();
  const candidateId = await getCandidateId(supabase, auth.user.id);
  if (!candidateId) return NextResponse.json({ error: 'Candidate profile not found' }, { status: 403 });

  const existing = await getInterview(supabase, id, candidateId);
  if (!existing) return NextResponse.json({ error: 'Interview not found' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const allowed = [
    'interview_type', 'scheduled_at', 'duration_minutes', 'timezone',
    'virtual_meeting_link', 'location', 'interviewer_name', 'interviewer_title',
    'interviewer_email', 'interviewer_linkedin', 'preparation_notes',
    'post_interview_notes', 'self_assessment_score', 'outcome', 'thank_you_sent',
  ] as const;
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of allowed) {
    if (body[key] !== undefined) {
      if (key === 'scheduled_at') update[key] = body[key] ? new Date(body[key]).toISOString() : null;
      else if (key === 'thank_you_sent') update[key] = Boolean(body[key]);
      else update[key] = body[key];
    }
  }

  const { data, error } = await supabase
    .from('interviews')
    .update(update)
    .eq('id', id)
    .select('*, job:jobs(id, title, company, location, url)')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiAuth(req, { effectiveRoles: ['candidate'] });
  if (auth instanceof Response) return auth;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const supabase = createServiceClient();
  const candidateId = await getCandidateId(supabase, auth.user.id);
  if (!candidateId) return NextResponse.json({ error: 'Candidate profile not found' }, { status: 403 });

  const existing = await getInterview(supabase, id, candidateId);
  if (!existing) return NextResponse.json({ error: 'Interview not found' }, { status: 404 });

  const { error } = await supabase.from('interviews').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
