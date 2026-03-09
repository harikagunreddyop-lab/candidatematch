/**
 * GET/PATCH/DELETE /api/emails/templates/[id]
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireApiAuth } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiAuth(_req, { roles: ['admin', 'recruiter'] });
  if (auth instanceof Response) return auth;

  const { id } = await params;
  if (id.startsWith('default-')) {
    return NextResponse.json({ error: 'Default templates are read-only' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('email_templates')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (data.company_id !== auth.profile.company_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return NextResponse.json(data);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiAuth(req, { effectiveRoles: ['platform_admin', 'company_admin', 'recruiter'] });
  if (auth instanceof Response) return auth;

  const { id } = await params;
  if (id.startsWith('default-')) {
    return NextResponse.json({ error: 'Default templates are read-only' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: existing } = await supabase
    .from('email_templates')
    .select('company_id')
    .eq('id', id)
    .single();

  if (!existing || existing.company_id !== auth.profile.company_id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const allowed = ['template_name', 'subject_template', 'body_template', 'template_type', 'variables', 'is_active'];
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of allowed) {
    if (body[key] !== undefined) update[key] = body[key];
  }

  const { data: updated, error } = await supabase
    .from('email_templates')
    .update(update)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiAuth(_req, { roles: ['admin', 'recruiter'] });
  if (auth instanceof Response) return auth;

  const { id } = await params;
  if (id.startsWith('default-')) {
    return NextResponse.json({ error: 'Default templates cannot be deleted' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: existing } = await supabase
    .from('email_templates')
    .select('company_id')
    .eq('id', id)
    .single();

  if (!existing || existing.company_id !== auth.profile.company_id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { error } = await supabase.from('email_templates').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
