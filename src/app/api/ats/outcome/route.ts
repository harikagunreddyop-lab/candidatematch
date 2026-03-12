import { NextRequest, NextResponse } from 'next/server';
import { requireRecruiterOrAdmin } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';
import { isValidUuid } from '@/lib/security';

export const dynamic = 'force-dynamic';

type Outcome = 'shortlisted' | 'interviewed' | 'hired' | 'rejected';

export async function POST(req: NextRequest) {
  const auth = await requireRecruiterOrAdmin(req);
  if (auth instanceof Response) return auth;

  const body = await req.json().catch(() => ({}));
  const {
    application_id,
    outcome,
    rejection_reason,
    human_decision,
    override_reason,
    manual_fit_score,
    manual_notes,
  } = body as {
    application_id?: string;
    outcome?: Outcome;
    rejection_reason?: string;
    human_decision?: string;
    override_reason?: string;
    manual_fit_score?: number;
    manual_notes?: string;
  };

  if (!application_id || !outcome) {
    return NextResponse.json(
      { error: 'application_id and outcome required' },
      { status: 400 },
    );
  }
  if (!isValidUuid(application_id)) {
    return NextResponse.json({ error: 'Invalid application_id' }, { status: 400 });
  }
  if (!['shortlisted', 'interviewed', 'hired', 'rejected'].includes(outcome)) {
    return NextResponse.json({ error: 'Invalid outcome' }, { status: 400 });
  }

  const service = createServiceClient();

  // 1. Validate application exists and belongs to a job in the recruiter's company
  const { data: appRow } = await service
    .from('applications')
    .select('id, candidate_id, job_id, jobs!inner(company_id), decision_action')
    .eq('id', application_id)
    .maybeSingle();

  if (!appRow) {
    return NextResponse.json({ error: 'Application not found' }, { status: 404 });
  }

  const appCompanyId = (appRow as any)?.jobs?.company_id ?? null;
  const effectiveRole = auth.profile.effective_role;

  const isPlatformAdmin = effectiveRole === 'platform_admin';
  if (!isPlatformAdmin) {
    if (!auth.profile.company_id || auth.profile.company_id !== appCompanyId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  // 2. Upsert into ats_outcome_labels
  const outcomeRow: Record<string, any> = {
    application_id,
    shortlisted: outcome === 'shortlisted' ? true : null,
    interviewed: outcome === 'interviewed' ? true : null,
    hired: outcome === 'hired' ? true : null,
    rejected: outcome === 'rejected' ? true : null,
    rejection_reason: outcome === 'rejected' ? (rejection_reason ?? null) : null,
    captured_at: new Date().toISOString(),
  };

  const { error: upsertErr } = await service
    .from('ats_outcome_labels')
    .upsert(outcomeRow, { onConflict: 'application_id' });

  if (upsertErr) {
    return NextResponse.json({ error: 'Failed to store outcome label' }, { status: 500 });
  }

  // 3. Insert recruiter feedback if provided
  const shouldWriteFeedback =
    typeof human_decision === 'string' ||
    typeof manual_fit_score === 'number';

  if (shouldWriteFeedback) {
    const { error: fbErr } = await service.from('ats_recruiter_feedback').insert({
      application_id,
      reviewer_id: auth.user.id,
      system_recommendation: (appRow as any)?.decision_action ?? 'unknown',
      human_decision: human_decision ?? outcome,
      override_reason: override_reason ?? null,
      manual_fit_score: typeof manual_fit_score === 'number' ? manual_fit_score : null,
      manual_notes: manual_notes ?? null,
      created_at: new Date().toISOString(),
    });

    if (fbErr) {
      return NextResponse.json({ error: 'Failed to store recruiter feedback' }, { status: 500 });
    }
  }

  // 4. Return
  return NextResponse.json({ success: true });
}

