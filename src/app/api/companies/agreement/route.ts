/**
 * POST /api/companies/agreement — Accept success-fee agreement when viewing candidate contact
 * Body: { candidate_id: string }
 * Auth: company_admin or recruiter for the company
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';
import { SUCCESS_FEE_CENTS, isCompanyPlanId, type CompanyPlanId } from '@/lib/plan-limits';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req, { effectiveRoles: ['platform_admin', 'company_admin', 'recruiter'] });
  if (auth instanceof Response) return auth;

  const companyId = auth.profile.company_id;
  if (!companyId) {
    return NextResponse.json({ error: 'No company context' }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const candidateId = body.candidate_id;
  if (!candidateId || typeof candidateId !== 'string') {
    return NextResponse.json({ error: 'candidate_id required' }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: company } = await supabase
    .from('companies')
    .select('subscription_plan')
    .eq('id', companyId)
    .single();

  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

  const planKey = isCompanyPlanId(company.subscription_plan) ? company.subscription_plan : 'starter';
  const amountCents = SUCCESS_FEE_CENTS[planKey as CompanyPlanId];

  const { error } = await supabase.from('success_fee_agreements').upsert(
    { company_id: companyId, candidate_id: candidateId },
    { onConflict: 'company_id,candidate_id' },
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    accepted: true,
    success_fee_cents: amountCents,
    message: 'By viewing this candidate\'s contact information, you agree to pay the success fee if you hire them within 12 months.',
  });
}
