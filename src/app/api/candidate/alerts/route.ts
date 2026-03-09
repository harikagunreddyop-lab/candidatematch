import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(req, { effectiveRoles: ['candidate'] });
  if (auth instanceof Response) return auth;

  const supabase = createServiceClient();
  const limit = Math.min(100, Math.max(1, parseInt(req.nextUrl.searchParams.get('limit') ?? '30', 10)));

  const { data: candidate } = await supabase
    .from('candidates')
    .select('id')
    .eq('user_id', auth.user.id)
    .single();

  if (!candidate) {
    return NextResponse.json({ alerts: [], unread_count: 0 });
  }

  const [{ data: alerts, error }, { count: unreadCount }] = await Promise.all([
    supabase
      .from('candidate_job_alert_events')
      .select('id, saved_search_id, candidate_id, job_id, channel, delivery_status, delivered_at, read_at, error_message, payload, created_at, job:jobs(id, title, company, location, url), saved_search:candidate_saved_searches(id, search_name)')
      .eq('candidate_id', candidate.id)
      .eq('channel', 'in_app')
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase
      .from('candidate_job_alert_events')
      .select('id', { count: 'exact', head: true })
      .eq('candidate_id', candidate.id)
      .eq('channel', 'in_app')
      .is('read_at', null),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ alerts: alerts ?? [], unread_count: unreadCount ?? 0 });
}
