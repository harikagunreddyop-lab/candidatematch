/**
 * GET /api/companies/candidate-contact?candidate_id= — Get candidate contact (email, phone) for company user.
 * If success-fee agreement not accepted for this company+candidate, returns requires_agreement: true and success_fee_cents.
 * Auth: company_admin or recruiter with access to the candidate.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';
import { SUCCESS_FEE_CENTS, isCompanyPlanId, type CompanyPlanId } from '@/lib/plan-limits';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(req, { effectiveRoles: ['platform_admin', 'company_admin', 'recruiter'] });
  if (auth instanceof Response) return auth;

  const companyId = auth.profile.company_id;
  const candidateId = req.nextUrl.searchParams.get('candidate_id');
  if (!candidateId || !companyId) {
    return NextResponse.json({ error: 'candidate_id and company context required' }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: agreement } = await supabase
    .from('success_fee_agreements')
    .select('id')
    .eq('company_id', companyId)
    .eq('candidate_id', candidateId)
    .maybeSingle();

  const { data: company } = await supabase
    .from('companies')
    .select('subscription_plan, max_candidates_viewed')
    .eq('id', companyId)
    .single();

  const planKey = company && isCompanyPlanId(company.subscription_plan) ? company.subscription_plan : 'starter';
  const successFeeCents = SUCCESS_FEE_CENTS[planKey as CompanyPlanId];
  const maxView = company?.max_candidates_viewed ?? 50;
  const unlimited = maxView >= 999;

  if (!unlimited) {
    const now = new Date();
    const firstDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
    const { data: usage } = await supabase
      .from('company_usage')
      .select('candidates_viewed')
      .eq('company_id', companyId)
      .eq('usage_month', firstDay)
      .maybeSingle();
    const used = usage?.candidates_viewed ?? 0;
    if (used >= maxView) {
      return NextResponse.json(
        {
          error: 'Candidate view limit reached for this month',
          limit: maxView,
          used,
          upgradeMessage: 'Upgrade your plan for more candidate profile views.',
        },
        { status: 429 },
      );
    }
  }

  if (!agreement) {
    return NextResponse.json({
      requires_agreement: true,
      success_fee_cents: successFeeCents,
      message: 'By viewing this candidate\'s contact information, you agree to pay the success fee if you hire them within 12 months.',
    });
  }

  const { data: candRow } = await supabase.from('candidates').select('user_id, email, phone').eq('id', candidateId).single();
  if (!candRow) return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });

  let email = candRow.email ?? null;
  let phone = candRow.phone ?? null;
  if (candRow.user_id) {
    const { data: profile } = await supabase.from('profiles').select('email').eq('id', candRow.user_id).maybeSingle();
    if (profile?.email && !email) email = profile.email;
  }

  if (!unlimited) {
    const now = new Date();
    const firstDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
    const { data: row } = await supabase.from('company_usage').select('candidates_viewed').eq('company_id', companyId).eq('usage_month', firstDay).maybeSingle();
    const nextCount = (row?.candidates_viewed ?? 0) + 1;
    await supabase.from('company_usage').upsert(
      { company_id: companyId, usage_month: firstDay, candidates_viewed: nextCount },
      { onConflict: 'company_id,usage_month' },
    );
  }

  return NextResponse.json({
    requires_agreement: false,
    email,
    phone,
  });
}
