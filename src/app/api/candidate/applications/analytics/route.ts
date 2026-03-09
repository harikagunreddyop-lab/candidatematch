/**
 * GET /api/candidate/applications/analytics
 * Returns aggregate stats for the current candidate's applications.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireApiAuth } from '@/lib/api-auth';
import type { ApplicationStatus } from '@/types';

export const dynamic = 'force-dynamic';

const STATUSES: ApplicationStatus[] = [
  'ready',
  'applied',
  'screening',
  'interview',
  'offer',
  'rejected',
  'withdrawn',
];

export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(req, { effectiveRoles: ['candidate'] });
  if (auth instanceof Response) return auth;

  const supabase = createServiceClient();
  const { data: candidate } = await supabase
    .from('candidates')
    .select('id')
    .eq('user_id', auth.user.id)
    .single();

  if (!candidate) {
    return NextResponse.json({
      total_applications: 0,
      by_status: Object.fromEntries(STATUSES.map((s) => [s, 0])),
      response_rate: 0,
      interview_rate: 0,
      offer_rate: 0,
    });
  }

  const { data: apps, error } = await supabase
    .from('applications')
    .select('id, status, applied_at, updated_at')
    .eq('candidate_id', candidate.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const list = apps ?? [];
  type AppRow = { status: ApplicationStatus; applied_at: string | null; updated_at: string };
  const typedList = list as AppRow[];
  const total = typedList.length;
  const by_status: Record<string, number> = {};
  STATUSES.forEach((s) => {
    by_status[s] = typedList.filter((a: AppRow) => a.status === s).length;
  });

  const appliedCount = typedList.filter((a: AppRow) => a.applied_at != null).length;
  const movedPastApplied = typedList.filter(
    (a: AppRow) => a.applied_at != null && !['ready', 'applied'].includes(a.status)
  ).length;
  const reachedInterview = typedList.filter((a: AppRow) =>
    ['screening', 'interview', 'offer'].includes(a.status)
  ).length;
  const reachedOffer = typedList.filter((a: AppRow) => a.status === 'offer').length;

  const response_rate = appliedCount > 0 ? Math.round((movedPastApplied / appliedCount) * 100) : 0;
  const interview_rate = appliedCount > 0 ? Math.round((reachedInterview / appliedCount) * 100) : 0;
  const offer_rate = appliedCount > 0 ? Math.round((reachedOffer / appliedCount) * 100) : 0;

  return NextResponse.json({
    total_applications: total,
    by_status,
    response_rate,
    interview_rate,
    offer_rate,
    applied_count: appliedCount,
  });
}
