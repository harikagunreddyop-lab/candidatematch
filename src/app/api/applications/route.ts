import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireApiAuth } from '@/lib/api-auth';
import { getPolicy, evaluateGateDecision } from '@/lib/policy-engine';
import { hasFeature } from '@/lib/feature-flags-server';
import { emitEvent, recordOutcome } from '@/lib/telemetry';
import { rateLimitResponse } from '@/lib/rate-limit';
import { FeatureGate } from '@/lib/feature-gates/index';
import { applicationCreateSchema } from '@/lib/validation/schemas';

export const dynamic = 'force-dynamic';

/** Candidates: max 40 new applications per calendar day (user's local time). */
const CANDIDATE_DAILY_APPLY_LIMIT = 40;
/** Recruiters: max 60 new applications per candidate per calendar day (user's local time). */
const RECRUITER_DAILY_APPLICATIONS_PER_CANDIDATE_LIMIT = 60;

function getLocalDayStart(tzOffsetMinutes: number): Date {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  todayStart.setTime(todayStart.getTime() + tzOffsetMinutes * 60_000);
  if (todayStart.getTime() > Date.now()) {
    todayStart.setTime(todayStart.getTime() - 86_400_000);
  }
  return todayStart;
}

/** GET /api/applications — List applications. Query: candidate_id, job_id, status, limit, offset. */
export async function GET(req: NextRequest) {
  const authResult = await requireApiAuth(req, { roles: ['admin', 'recruiter', 'candidate'] });
  if (authResult instanceof Response) return authResult;
  const { profile } = authResult;

  const supabase = createServiceClient();
  const { searchParams } = new URL(req.url);
  const candidateIdParam = searchParams.get('candidate_id');
  const jobIdParam = searchParams.get('job_id');
  const statusParam = searchParams.get('status');
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10)));
  const offset = Math.max(0, parseInt(searchParams.get('offset') ?? '0', 10));

  let q = supabase
    .from('applications')
    .select('*, job:jobs(id, title, company, location, url), candidate:candidates(id, full_name, primary_title, email)')
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (profile.role === 'candidate') {
    const { data: cand } = await supabase.from('candidates').select('id').eq('user_id', authResult.user.id).single();
    if (!cand) return NextResponse.json({ applications: [] });
    q = q.eq('candidate_id', cand.id);
  } else if (profile.role === 'recruiter' || profile.effective_role === 'company_admin') {
    const companyId = profile.company_id;
    if (!companyId) return NextResponse.json({ applications: [] });
    const { data: companyJobs } = await supabase.from('jobs').select('id').eq('company_id', companyId);
    const jobIds = (companyJobs ?? []).map((j: { id: string }) => j.id);
    if (jobIds.length === 0) return NextResponse.json({ applications: [] });
    q = q.in('job_id', jobIds);
  } else {
    if (candidateIdParam) q = q.eq('candidate_id', candidateIdParam);
    if (jobIdParam) q = q.eq('job_id', jobIdParam);
  }

  if (statusParam) q = q.eq('status', statusParam);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ applications: data ?? [] });
}

export async function POST(req: NextRequest) {
  const authResult = await requireApiAuth(req, { roles: ['admin', 'recruiter', 'candidate'] });
  if (authResult instanceof Response) return authResult;
  const { profile } = authResult;

  const rl = await rateLimitResponse(req, 'api', authResult.user.id);
  if (rl) return rl;

  const body = await req.json().catch(() => ({}));
  const parsed = applicationCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.issues },
      { status: 400 }
    );
  }
  const { candidate_id: candidateId, job_id: jobId, override_gate: overrideGateFromBody, override_reason: overrideReason } = parsed.data;

  const supabase = createServiceClient();

  // Check if application already exists (for candidate limit/gate: only apply to new applications)
  const { data: existingApplication } = await supabase
    .from('applications')
    .select('id')
    .eq('candidate_id', candidateId)
    .eq('job_id', jobId)
    .maybeSingle();

  if (profile.role === 'candidate') {
    const { data: c } = await supabase.from('candidates').select('id').eq('id', candidateId).eq('user_id', authResult.user.id).single();
    if (!c) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const canApply = await hasFeature(supabase, authResult.user.id, profile.role, 'candidate_apply_jobs', true);
    if (!canApply) return NextResponse.json({ error: 'Apply access is restricted' }, { status: 403 });
    if (!existingApplication) {
      const gate = new FeatureGate();
      const access = await gate.checkAccess(candidateId, 'applications');
      if (!access.allowed) {
        return NextResponse.json(
          {
            error: access.reason === 'limit_reached'
              ? `You've reached your monthly application limit (${(access as { limit: number }).limit}). Upgrade for more.`
              : 'Upgrade your plan to submit more applications.',
            reason: access.reason,
            upgrade_url: '/pricing',
            ...(access.reason === 'limit_reached' ? { limit: (access as { limit: number }).limit, used: (access as { used: number }).used } : {}),
          },
          { status: 403 }
        );
      }
    }
  } else if (profile.role === 'recruiter') {
    const { data: job } = await supabase.from('jobs').select('id').eq('id', jobId).eq('posted_by', profile.id).single();
    if (!job) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: match } = await supabase
    .from('candidate_job_matches')
    .select('ats_score, ats_confidence_bucket, scoring_profile, matched_keywords, missing_keywords')
    .eq('candidate_id', candidateId)
    .eq('job_id', jobId)
    .maybeSingle();

  // Block only when policy gate blocks. Profile C never hard-blocks; Profile A blocks below threshold.
  // Recruiters/admins can override with body.override_gate = true (audit trail emitted).
  const overrideGate = overrideGateFromBody === true && (profile.role === 'recruiter' || profile.role === 'admin');
  const atsScore = match?.ats_score;
  if (typeof atsScore === 'number') {
    const scoringProfile = (match?.scoring_profile as 'A' | 'C') || 'A';
    const policy = getPolicy(scoringProfile);
    const bucket = (match?.ats_confidence_bucket as 'insufficient' | 'moderate' | 'good' | 'high') || 'moderate';
    const gate = evaluateGateDecision(atsScore, bucket, policy);
    if (!gate.passes) {
      if (overrideGate) {
        // Recruiter/admin override — emit audit event, then proceed
        void emitEvent(supabase, {
          event_type: 'ats_gate_override',
          candidate_id: candidateId,
          job_id: jobId,
          actor_user_id: authResult.user.id,
          event_source: 'apply',
          payload: {
            ats_score: atsScore,
            confidence_bucket: bucket,
            threshold_used: gate.threshold_used,
            scoring_profile: scoringProfile,
            override_reason: parsed.data.override_reason || null,
          },
        });
      } else {
        // Emit adverse decision for audit (NYC AEDT / EU AI Act)
        void emitEvent(supabase, {
          event_type: 'ats_gate_blocked',
          candidate_id: candidateId,
          job_id: jobId,
          actor_user_id: authResult.user.id,
          event_source: 'apply',
          payload: {
            ats_score: atsScore,
            confidence_bucket: bucket,
            threshold_used: gate.threshold_used,
            scoring_profile: scoringProfile,
            recommend_review: gate.recommend_review,
          },
        });

        const missingKeywords = (match?.missing_keywords as string[] | undefined) || [];

        return NextResponse.json(
          {
            error: `ATS score (${atsScore}) did not meet the apply threshold.`,
            gate_reason: gate.reason,
            ats_score: atsScore,
            recommend_review: gate.recommend_review,
            adverse_action_notice: {
              code: 'AEDT_BLOCKED',
              reason: gate.reason,
              ats_score: atsScore,
              missing_skills: missingKeywords.slice(0, 10),
              improvement_tip: missingKeywords.length > 0
                ? `Consider adding these skills to your resume: ${missingKeywords.slice(0, 5).join(', ')}.`
                : 'Review your resume against the job description and consider adding relevant skills or experience.',
              right_to_request_human_review: true,
            },
          },
          { status: 400 }
        );
      }
    }
  }

  // Use existingApplication (fetched above) for update vs new
  const existing = existingApplication;

  const tzOffset = typeof body.tz_offset === 'number' ? body.tz_offset : 0;
  const todayStart = getLocalDayStart(tzOffset);

  if (profile.role === 'candidate' && !existing) {
    const { count } = await supabase
      .from('applications')
      .select('id', { count: 'exact', head: true })
      .eq('candidate_id', candidateId)
      .not('applied_at', 'is', null)
      .gte('applied_at', todayStart.toISOString());
    if ((count ?? 0) >= CANDIDATE_DAILY_APPLY_LIMIT) {
      return NextResponse.json(
        { error: `Daily limit reached. Candidates can submit up to ${CANDIDATE_DAILY_APPLY_LIMIT} applications per day. Resets at midnight.` },
        { status: 400 }
      );
    }
  }

  if ((profile.role === 'recruiter' || profile.role === 'admin') && !existing) {
    const { count } = await supabase
      .from('applications')
      .select('id', { count: 'exact', head: true })
      .eq('candidate_id', candidateId)
      .not('applied_at', 'is', null)
      .gte('applied_at', todayStart.toISOString());
    if ((count ?? 0) >= RECRUITER_DAILY_APPLICATIONS_PER_CANDIDATE_LIMIT) {
      return NextResponse.json(
        { error: `Daily limit reached. You can record up to ${RECRUITER_DAILY_APPLICATIONS_PER_CANDIDATE_LIMIT} applications per candidate per day. This candidate is at today's limit.` },
        { status: 400 }
      );
    }
  }

  const payload: Record<string, unknown> = {
    candidate_id: body.candidate_id,
    job_id: body.job_id,
    resume_version_id: body.resume_version_id || null,
    status: body.status || 'applied',
    applied_at: body.status === 'applied' ? new Date().toISOString() : null,
    notes: body.notes || null,
  };
  if (body.candidate_resume_id !== undefined) payload.candidate_resume_id = body.candidate_resume_id || null;
  if (body.candidate_notes !== undefined) payload.candidate_notes = body.candidate_notes || null;

  const { data, error } = await supabase
    .from('applications')
    .upsert(payload, { onConflict: 'candidate_id,job_id' })
    .select('*, job:jobs(id, title, company)')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (profile.role === 'candidate' && !existing && data) {
    const gate = new FeatureGate();
    await gate.trackUsage(data.candidate_id, 'applications');
  }

  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest) {
  const authResult = await requireApiAuth(req, { roles: ['admin', 'recruiter'] });
  if (authResult instanceof Response) return authResult;
  const { profile } = authResult;

  const supabase = createServiceClient();
  const body = await req.json().catch(() => ({}));
  const appId = body?.id;
  if (!appId) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { data: app } = await supabase.from('applications').select('candidate_id, job_id, status').eq('id', appId).single();
  if (!app) return NextResponse.json({ error: 'Application not found' }, { status: 404 });
  if (profile.role === 'recruiter') {
    const { data: job } = await supabase.from('jobs').select('id').eq('id', app.job_id).eq('posted_by', profile.id).single();
    if (!job) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const fromStatus = app.status;
  const toStatus = body.status ?? fromStatus;
  const updatePayload: Record<string, unknown> = {
    status: toStatus,
    notes: body.notes,
    ...(toStatus === 'applied' ? { applied_at: new Date().toISOString() } : {}),
  };
  if (body.interview_date !== undefined) updatePayload.interview_date = body.interview_date || null;
  if (body.interview_notes !== undefined) updatePayload.interview_notes = body.interview_notes ?? null;
  if (body.notes !== undefined && toStatus === 'interview') updatePayload.notes = body.notes;

  const { data, error } = await supabase
    .from('applications')
    .update(updatePayload)
    .eq('id', body.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (fromStatus !== toStatus) {
    await supabase.from('application_status_history').insert({
      application_id: appId,
      from_status: fromStatus,
      to_status: toStatus,
      notes: body.notes ?? null,
      actor_id: profile.id,
    });

    // Outcome feedback loop: record for calibration (interview/offer/hired/rejected)
    if (['interview', 'offer', 'hired', 'rejected'].includes(toStatus)) {
      const { data: match } = await supabase
        .from('candidate_job_matches')
        .select('ats_score, ats_breakdown, scoring_profile')
        .eq('candidate_id', app.candidate_id)
        .eq('job_id', app.job_id)
        .maybeSingle();
      const breakdown = match?.ats_breakdown as { job_family?: string } | null;
      void recordOutcome(supabase, {
        candidateId: app.candidate_id,
        jobId: app.job_id,
        applicationId: appId,
        newStatus: toStatus,
        previousStatus: fromStatus,
        atsScoreAtApplication: match?.ats_score ?? null,
        jobFamily: breakdown?.job_family ?? null,
        scoringProfile: (match?.scoring_profile as 'A' | 'C') ?? null,
        actorUserId: profile.id,
      });
    }
  }
  return NextResponse.json(data);
}
