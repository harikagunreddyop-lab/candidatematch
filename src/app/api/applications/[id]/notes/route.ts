/**
 * GET /api/applications/[id]/notes — List notes for an application.
 * POST /api/applications/[id]/notes — Add a note (candidate only).
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
    .from('application_notes')
    .select('*')
    .eq('application_id', id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ notes: data ?? [] });
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
  const content = typeof body.content === 'string' ? body.content.trim() : '';
  const note_type = ['private', 'interview_prep', 'research', 'custom'].includes(body.note_type)
    ? body.note_type
    : 'private';

  if (!content) return NextResponse.json({ error: 'content required' }, { status: 400 });

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
    .from('application_notes')
    .insert({
      application_id: id,
      candidate_id: c.id,
      note_type,
      content,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ note: data });
}
