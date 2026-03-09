/**
 * GET /api/candidate/interviews — List current candidate's interviews.
 * POST /api/candidate/interviews — Create an interview (candidate only).
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

export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(req, { effectiveRoles: ['candidate'] });
  if (auth instanceof Response) return auth;

  const supabase = createServiceClient();
  const candidateId = await getCandidateId(supabase, auth.user.id);
  if (!candidateId) return NextResponse.json({ interviews: [] });

  const { searchParams } = new URL(req.url);
  const upcoming = searchParams.get('upcoming') === 'true';
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  let q = supabase
    .from('interviews')
    .select(`
      *,
      job:jobs(id, title, company, location, url),
      application:applications(id, status)
    `)
    .eq('candidate_id', candidateId)
    .order('scheduled_at', { ascending: true });

  if (upcoming) {
    q = q.gte('scheduled_at', new Date().toISOString());
  }
  if (from) q = q.gte('scheduled_at', from);
  if (to) q = q.lte('scheduled_at', to);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ interviews: data ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req, { effectiveRoles: ['candidate'] });
  if (auth instanceof Response) return auth;

  const supabase = createServiceClient();
  const candidateId = await getCandidateId(supabase, auth.user.id);
  if (!candidateId) return NextResponse.json({ error: 'Candidate profile not found' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const {
    application_id,
    job_id,
    interview_type,
    scheduled_at,
    duration_minutes = 60,
    timezone,
    virtual_meeting_link,
    location,
    interviewer_name,
    interviewer_title,
    interviewer_email,
    interviewer_linkedin,
    preparation_notes,
  } = body;

  if (!scheduled_at || !job_id) {
    return NextResponse.json({ error: 'scheduled_at and job_id are required' }, { status: 400 });
  }

  // If application_id provided, verify it belongs to this candidate
  if (application_id) {
    const { data: app } = await supabase
      .from('applications')
      .select('id, candidate_id, job_id')
      .eq('id', application_id)
      .single();
    if (!app || app.candidate_id !== candidateId)
      return NextResponse.json({ error: 'Application not found' }, { status: 404 });
  }

  // Verify job exists and candidate has access (e.g. has application or match)
  const { data: job } = await supabase.from('jobs').select('id').eq('id', job_id).single();
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

  const insert: Record<string, unknown> = {
    candidate_id: candidateId,
    job_id,
    application_id: application_id || null,
    interview_type: interview_type || null,
    scheduled_at: new Date(scheduled_at).toISOString(),
    duration_minutes: Number(duration_minutes) || 60,
    timezone: timezone || null,
    virtual_meeting_link: virtual_meeting_link || null,
    location: location || null,
    interviewer_name: interviewer_name || null,
    interviewer_title: interviewer_title || null,
    interviewer_email: interviewer_email || null,
    interviewer_linkedin: interviewer_linkedin || null,
    preparation_notes: preparation_notes || null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('interviews')
    .insert(insert)
    .select('*, job:jobs(id, title, company, location, url)')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
