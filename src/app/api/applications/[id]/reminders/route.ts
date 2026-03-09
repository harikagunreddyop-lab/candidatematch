/**
 * GET /api/applications/[id]/reminders — List reminders for an application.
 * POST /api/applications/[id]/reminders — Create a reminder (candidate only).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireApiAuth } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiAuth(req, { effectiveRoles: ['candidate', 'platform_admin', 'company_admin', 'recruiter'] });
  if (auth instanceof Response) return auth;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const supabase = createServiceClient();
  const { data: app } = await supabase
    .from('applications')
    .select('candidate_id')
    .eq('id', id)
    .single();

  if (!app) return NextResponse.json({ error: 'Application not found' }, { status: 404 });

  if (auth.profile.role === 'candidate') {
    const { data: c } = await supabase
      .from('candidates')
      .select('id')
      .eq('id', app.candidate_id)
      .eq('user_id', auth.user.id)
      .single();
    if (!c) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await supabase
    .from('application_reminders')
    .select('*')
    .eq('application_id', id)
    .order('remind_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reminders: data ?? [] });
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
  const remind_at = body.remind_at;
  const message = typeof body.message === 'string' ? body.message.trim() : null;
  const reminder_type = body.reminder_type || 'follow_up';

  if (!remind_at) return NextResponse.json({ error: 'remind_at required' }, { status: 400 });
  const d = new Date(remind_at);
  if (Number.isNaN(d.getTime())) return NextResponse.json({ error: 'Invalid remind_at' }, { status: 400 });

  const supabase = createServiceClient();
  const { data: app } = await supabase
    .from('applications')
    .select('candidate_id')
    .eq('id', id)
    .single();

  if (!app) return NextResponse.json({ error: 'Application not found' }, { status: 404 });

  const { data: c } = await supabase
    .from('candidates')
    .select('id')
    .eq('id', app.candidate_id)
    .eq('user_id', auth.user.id)
    .single();
  if (!c) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data, error } = await supabase
    .from('application_reminders')
    .insert({
      application_id: id,
      candidate_id: c.id,
      remind_at: d.toISOString(),
      message: message || null,
      reminder_type,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reminder: data });
}
