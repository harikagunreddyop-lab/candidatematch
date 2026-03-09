/**
 * POST /api/company/jobs/[id]/check-inclusivity
 * Check job description for inclusive language issues.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';
import { checkInclusiveLanguage } from '@/lib/ai/inclusive-language-checker';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiAuth(req, {
    effectiveRoles: ['platform_admin', 'company_admin', 'recruiter'],
  });
  if (auth instanceof Response) return auth;

  const companyId = auth.profile.company_id;
  if (!companyId) return NextResponse.json({ error: 'No company context' }, { status: 400 });

  const { id: jobId } = await params;
  const supabase = createServiceClient();
  const { data: job } = await supabase
    .from('jobs')
    .select('id, jd_clean, jd_raw')
    .eq('id', jobId)
    .eq('company_id', companyId)
    .single();

  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

  const text = (job.jd_clean || job.jd_raw || '') as string;
  const result = checkInclusiveLanguage(text);
  return NextResponse.json(result);
}
