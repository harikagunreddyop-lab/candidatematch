/**
 * DELETE /api/candidate/saved-searches/[id]
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiAuth(req, { effectiveRoles: ['candidate'] });
  if (auth instanceof Response) return auth;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const supabase = createServiceClient();
  const { data: candidate } = await supabase
    .from('candidates')
    .select('id')
    .eq('user_id', auth.user.id)
    .single();

  if (!candidate) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { error } = await supabase
    .from('candidate_saved_searches')
    .delete()
    .eq('id', id)
    .eq('candidate_id', candidate.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiAuth(req, { effectiveRoles: ['candidate'] });
  if (auth instanceof Response) return auth;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if (typeof body.search_name === 'string' && body.search_name.trim()) {
    patch.search_name = body.search_name.trim();
  }
  if (body.search_params && typeof body.search_params === 'object') {
    patch.search_params = body.search_params;
  }
  if (body.alert_frequency === null || body.alert_frequency === '') {
    patch.alert_frequency = null;
  } else if (typeof body.alert_frequency === 'string' && ['daily', 'weekly', 'instant'].includes(body.alert_frequency)) {
    patch.alert_frequency = body.alert_frequency;
  }
  if (typeof body.is_active === 'boolean') {
    patch.is_active = body.is_active;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

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
    .from('candidate_saved_searches')
    .update(patch)
    .eq('id', id)
    .eq('candidate_id', candidate.id)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ saved_search: data });
}
