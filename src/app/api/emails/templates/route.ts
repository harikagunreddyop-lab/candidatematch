/**
 * GET /api/emails/templates — List company templates (or defaults if no company).
 * POST /api/emails/templates — Create template (company required).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireApiAuth } from '@/lib/api-auth';
import { DEFAULT_EMAIL_TEMPLATES } from '@/lib/email-templates';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(req, { effectiveRoles: ['platform_admin', 'company_admin', 'recruiter'] });
  if (auth instanceof Response) return auth;

  const companyId = auth.profile.company_id ?? null;
  const supabase = createServiceClient();

  if (!companyId) {
    return NextResponse.json({
      templates: DEFAULT_EMAIL_TEMPLATES.map((t) => ({
        id: `default-${t.template_type}`,
        template_name: t.name,
        template_type: t.template_type,
        subject_template: t.subject,
        body_template: t.body,
        variables: t.variables,
        is_default: true,
      })),
    });
  }

  const { data: rows, error } = await supabase
    .from('email_templates')
    .select('id, template_name, subject_template, body_template, template_type, variables, is_active')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .order('template_name');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const defaults = DEFAULT_EMAIL_TEMPLATES.map((t) => ({
    id: `default-${t.template_type}`,
    template_name: t.name,
    template_type: t.template_type,
    subject_template: t.subject,
    body_template: t.body,
    variables: t.variables,
    is_default: true,
  }));

  return NextResponse.json({
    templates: [...defaults, ...(rows ?? []).map((r: { id: string; template_name: string; subject_template: string; body_template: string; template_type: string | null; variables: string[]; is_active: boolean }) => ({ ...r, is_default: false }))],
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req, { effectiveRoles: ['platform_admin', 'company_admin', 'recruiter'] });
  if (auth instanceof Response) return auth;

  const companyId = auth.profile.company_id;
  if (!companyId) {
    return NextResponse.json({ error: 'Company context required to create templates' }, { status: 403 });
  }

  let body: {
    template_name?: string;
    subject_template?: string;
    body_template?: string;
    template_type?: string;
    variables?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.template_name || !body.subject_template || !body.body_template) {
    return NextResponse.json({ error: 'template_name, subject_template, body_template required' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: inserted, error } = await supabase
    .from('email_templates')
    .insert({
      company_id: companyId,
      template_name: body.template_name,
      subject_template: body.subject_template,
      body_template: body.body_template,
      template_type: body.template_type ?? null,
      variables: body.variables ?? [],
      is_active: true,
      created_by: auth.user.id,
      updated_at: new Date().toISOString(),
    })
    .select('id, template_name, subject_template, body_template, template_type, variables')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(inserted);
}
