import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiAuth(req, { effectiveRoles: ['candidate'] });
  if (auth instanceof Response) return auth;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const markRead = body.read === true;
  if (!markRead) return NextResponse.json({ error: 'Only read=true is supported' }, { status: 400 });

  const supabase = createServiceClient();
  const { data: candidate } = await supabase
    .from('candidates')
    .select('id')
    .eq('user_id', auth.user.id)
    .single();

  if (!candidate) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await supabase
    .from('candidate_job_alert_events')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .eq('candidate_id', candidate.id)
    .eq('channel', 'in_app')
    .select('id, read_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ alert: data });
}
