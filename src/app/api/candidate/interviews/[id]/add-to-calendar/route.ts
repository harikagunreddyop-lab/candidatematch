/**
 * POST /api/candidate/interviews/[id]/add-to-calendar
 * Body: { access_token: string } — Google OAuth access token (with calendar scope).
 * Creates an event on the user's primary Google Calendar.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireApiAuth } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

async function getCandidateId(supabase: ReturnType<typeof createServiceClient>, userId: string) {
  const { data } = await supabase.from('candidates').select('id').eq('user_id', userId).single();
  return data?.id ?? null;
}

function addMinutes(iso: string, minutes: number): string {
  const d = new Date(new Date(iso).getTime() + minutes * 60 * 1000);
  return d.toISOString();
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiAuth(req, { effectiveRoles: ['candidate'] });
  if (auth instanceof Response) return auth;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const accessToken = body.access_token ? String(body.access_token).trim() : '';
  if (!accessToken) {
    return NextResponse.json(
      { error: 'access_token required. Connect Google Calendar in Integrations and pass the token, or use the Add to Google Calendar link.' },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();
  const candidateId = await getCandidateId(supabase, auth.user.id);
  if (!candidateId) return NextResponse.json({ error: 'Candidate profile not found' }, { status: 403 });

  const { data: interview, error: fetchErr } = await supabase
    .from('interviews')
    .select(`
      id, scheduled_at, duration_minutes, timezone, interview_type,
      virtual_meeting_link, interviewer_name, preparation_notes,
      job:jobs(title, company)
    `)
    .eq('id', id)
    .eq('candidate_id', candidateId)
    .single();

  if (fetchErr || !interview) return NextResponse.json({ error: 'Interview not found' }, { status: 404 });

  const job = Array.isArray(interview.job) ? interview.job[0] : interview.job;
  const title = job?.title ?? 'Interview';
  const company = job?.company ?? '';
  const summary = `Interview - ${title} at ${company}`;
  const tz = interview.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const start = new Date(interview.scheduled_at).toISOString();
  const end = addMinutes(interview.scheduled_at, interview.duration_minutes || 60);

  const description = [
    `Interview Type: ${interview.interview_type || 'Interview'}`,
    interview.interviewer_name ? `Interviewer: ${interview.interviewer_name}` : '',
    interview.virtual_meeting_link ? `Meeting Link: ${interview.virtual_meeting_link}` : '',
    '',
    'Prepare using CandidateMatch interview prep.',
  ].filter(Boolean).join('\n');

  const event = {
    summary,
    description,
    start: { dateTime: start, timeZone: tz },
    end: { dateTime: end, timeZone: tz },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'email', minutes: 24 * 60 },
        { method: 'popup', minutes: 60 },
        { method: 'popup', minutes: 15 },
      ],
    },
  };

  const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(event),
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json(
      { error: 'Google Calendar API error. Ensure you have granted calendar scope.', details: err },
      { status: 502 }
    );
  }

  const data = await res.json();
  return NextResponse.json({ event_id: data.id, html_link: data.htmlLink });
}
