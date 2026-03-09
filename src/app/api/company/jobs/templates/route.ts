/**
 * GET /api/company/jobs/templates — List templates for the company (+ public).
 * POST /api/company/jobs/templates — Create a template.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(req, {
    effectiveRoles: ['platform_admin', 'company_admin', 'recruiter'],
  });
  if (auth instanceof Response) return auth;

  const companyId = auth.profile.company_id;
  if (!companyId) return NextResponse.json({ templates: [] });

  const supabase = createServiceClient();
  const { data: companyTemplates } = await supabase
    .from('job_templates')
    .select('*')
    .eq('company_id', companyId)
    .order('usage_count', { ascending: false });

  const { data: publicTemplates } = await supabase
    .from('job_templates')
    .select('*')
    .eq('is_public', true)
    .neq('company_id', companyId)
    .order('usage_count', { ascending: false })
    .limit(20);

  const templates = [...(companyTemplates ?? []), ...(publicTemplates ?? [])];
  return NextResponse.json({ templates });
}

export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req, {
    effectiveRoles: ['platform_admin', 'company_admin', 'recruiter'],
  });
  if (auth instanceof Response) return auth;

  const companyId = auth.profile.company_id;
  if (!companyId) return NextResponse.json({ error: 'No company context' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const template_name = typeof body.template_name === 'string' ? body.template_name.trim() : 'Untitled template';
  const job_title = typeof body.job_title === 'string' ? body.job_title.trim() : '';
  const job_description = typeof body.job_description === 'string' ? body.job_description : '';
  if (!job_title || !job_description) {
    return NextResponse.json({ error: 'job_title and job_description required' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: template, error } = await supabase
    .from('job_templates')
    .insert({
      company_id: companyId,
      template_name,
      job_title,
      job_description,
      requirements: Array.isArray(body.requirements) ? body.requirements : [],
      benefits: Array.isArray(body.benefits) ? body.benefits : [],
      salary_range: body.salary_range && typeof body.salary_range === 'object' ? body.salary_range : null,
      is_public: false,
      created_by: auth.profile.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ template });
}
