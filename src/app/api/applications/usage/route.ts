import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireApiAuth } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

const CANDIDATE_DAILY_APPLY_LIMIT = 40;
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

/** GET ?candidate_id= & tz_offset= (optional). Returns used_today and limit for the auth user. */
export async function GET(req: NextRequest) {
  const authResult = await requireApiAuth(req, { roles: ['admin', 'recruiter', 'candidate'] });
  if (authResult instanceof Response) return authResult;
  const { profile } = authResult;

  const candidateId = req.nextUrl.searchParams.get('candidate_id');
  const tzOffset = Number(req.nextUrl.searchParams.get('tz_offset')) || 0;
  const todayStart = getLocalDayStart(tzOffset);

  const supabase = createServiceClient();

  if (profile.role === 'candidate') {
    const { data: c } = await supabase
      .from('candidates')
      .select('id')
      .eq('user_id', authResult.user.id)
      .single();
    if (!c) return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
    const { count } = await supabase
      .from('applications')
      .select('id', { count: 'exact', head: true })
      .eq('candidate_id', c.id)
      .not('applied_at', 'is', null)
      .gte('applied_at', todayStart.toISOString());
    return NextResponse.json({
      used_today: count ?? 0,
      limit: CANDIDATE_DAILY_APPLY_LIMIT,
      role: 'candidate',
    });
  }

  if (profile.role === 'recruiter' || profile.role === 'admin') {
    if (!candidateId) return NextResponse.json({ error: 'candidate_id required for recruiter/admin' }, { status: 400 });
    const { data: a } = await supabase
      .from('recruiter_candidate_assignments')
      .select('recruiter_id')
      .eq('candidate_id', candidateId)
      .eq('recruiter_id', profile.id)
      .single();
    if (!a && profile.role === 'recruiter') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const { count } = await supabase
      .from('applications')
      .select('id', { count: 'exact', head: true })
      .eq('candidate_id', candidateId)
      .not('applied_at', 'is', null)
      .gte('applied_at', todayStart.toISOString());
    return NextResponse.json({
      used_today: count ?? 0,
      limit: RECRUITER_DAILY_APPLICATIONS_PER_CANDIDATE_LIMIT,
      role: profile.role,
    });
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}
