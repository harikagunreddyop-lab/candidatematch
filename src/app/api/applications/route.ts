import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireApiAuth } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

/** Candidates: max 40 new applications per calendar day (user's local time). */
const CANDIDATE_DAILY_APPLY_LIMIT = 40;
/** Recruiters: max 60 new applications per candidate per calendar day (user's local time). */
const RECRUITER_DAILY_APPLICATIONS_PER_CANDIDATE_LIMIT = 60;

function getLocalDayStart(tzOffsetMinutes: number): Date {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  todayStart.setTime(todayStart.getTime() + tzOffsetMinutes * 60_000);
  if (todayStart.getTime() > Date.now()) {
    todayStart.setTime(todayStart.getTime() - 86_400_000);
  }
  return todayStart;
}

export async function POST(req: NextRequest) {
  const authResult = await requireApiAuth(req, { roles: ['admin', 'recruiter', 'candidate'] });
  if (authResult instanceof Response) return authResult;
  const { profile } = authResult;

  const body = await req.json().catch(() => ({}));
  const candidateId = body?.candidate_id;
  const jobId = body?.job_id;
  if (!candidateId || !jobId) {
    return NextResponse.json({ error: 'candidate_id and job_id required' }, { status: 400 });
  }

  const supabase = createServiceClient();
  if (profile.role === 'candidate') {
    const { data: c } = await supabase.from('candidates').select('id').eq('id', candidateId).eq('user_id', authResult.user.id).single();
    if (!c) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  } else if (profile.role === 'recruiter') {
    const { data: a } = await supabase.from('recruiter_candidate_assignments').select('recruiter_id').eq('candidate_id', candidateId).eq('recruiter_id', profile.id).single();
    if (!a) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: match } = await supabase
    .from('candidate_job_matches')
    .select('ats_score')
    .eq('candidate_id', candidateId)
    .eq('job_id', jobId)
    .maybeSingle();

  // Only block if an ATS check has actually been run AND the score is below 50.
  // If no ATS check has been run yet, always allow applying.
  const atsScore = match?.ats_score;
  if (typeof atsScore === 'number' && atsScore < 50) {
    return NextResponse.json(
      { error: `ATS score (${atsScore}) is below 50. Applying is not allowed.` },
      { status: 400 }
    );
  }

  // Check if this is an update (existing row) or a new application
  const { data: existing } = await supabase
    .from('applications')
    .select('id')
    .eq('candidate_id', candidateId)
    .eq('job_id', jobId)
    .maybeSingle();

  const tzOffset = typeof body.tz_offset === 'number' ? body.tz_offset : 0;
  const todayStart = getLocalDayStart(tzOffset);

  if (profile.role === 'candidate' && !existing) {
    const { count } = await supabase
      .from('applications')
      .select('id', { count: 'exact', head: true })
      .eq('candidate_id', candidateId)
      .not('applied_at', 'is', null)
      .gte('applied_at', todayStart.toISOString());
    if ((count ?? 0) >= CANDIDATE_DAILY_APPLY_LIMIT) {
      return NextResponse.json(
        { error: `Daily limit reached. Candidates can submit up to ${CANDIDATE_DAILY_APPLY_LIMIT} applications per day. Resets at midnight.` },
        { status: 400 }
      );
    }
  }

  if ((profile.role === 'recruiter' || profile.role === 'admin') && !existing) {
    const { count } = await supabase
      .from('applications')
      .select('id', { count: 'exact', head: true })
      .eq('candidate_id', candidateId)
      .not('applied_at', 'is', null)
      .gte('applied_at', todayStart.toISOString());
    if ((count ?? 0) >= RECRUITER_DAILY_APPLICATIONS_PER_CANDIDATE_LIMIT) {
      return NextResponse.json(
        { error: `Daily limit reached. You can record up to ${RECRUITER_DAILY_APPLICATIONS_PER_CANDIDATE_LIMIT} applications per candidate per day. This candidate is at today's limit.` },
        { status: 400 }
      );
    }
  }

  const payload: Record<string, unknown> = {
    candidate_id: body.candidate_id,
    job_id: body.job_id,
    resume_version_id: body.resume_version_id || null,
    status: body.status || 'applied',
    applied_at: body.status === 'applied' ? new Date().toISOString() : null,
    notes: body.notes || null,
  };
  if (body.candidate_resume_id !== undefined) payload.candidate_resume_id = body.candidate_resume_id || null;
  if (body.candidate_notes !== undefined) payload.candidate_notes = body.candidate_notes || null;

  const { data, error } = await supabase
    .from('applications')
    .upsert(payload, { onConflict: 'candidate_id,job_id' })
    .select('*, job:jobs(id, title, company)')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest) {
  const authResult = await requireApiAuth(req, { roles: ['admin', 'recruiter'] });
  if (authResult instanceof Response) return authResult;
  const { profile } = authResult;

  const supabase = createServiceClient();
  const body = await req.json().catch(() => ({}));
  const appId = body?.id;
  if (!appId) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { data: app } = await supabase.from('applications').select('candidate_id, status').eq('id', appId).single();
  if (!app) return NextResponse.json({ error: 'Application not found' }, { status: 404 });
  if (profile.role === 'recruiter') {
    const { data: a } = await supabase.from('recruiter_candidate_assignments').select('recruiter_id').eq('candidate_id', app.candidate_id).eq('recruiter_id', profile.id).single();
    if (!a) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const fromStatus = app.status;
  const toStatus = body.status ?? fromStatus;

  const { data, error } = await supabase
    .from('applications')
    .update({
      status: toStatus,
      notes: body.notes,
      ...(toStatus === 'applied' ? { applied_at: new Date().toISOString() } : {}),
    })
    .eq('id', body.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (fromStatus !== toStatus) {
    await supabase.from('application_status_history').insert({
      application_id: appId,
      from_status: fromStatus,
      to_status: toStatus,
      notes: body.notes ?? null,
      actor_id: profile.id,
    });
  }
  return NextResponse.json(data);
}
