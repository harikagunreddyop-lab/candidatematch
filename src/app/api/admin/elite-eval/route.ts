/**
 * Admin route: elite ATS evaluation harness (no DB writes).
 *
 * POST /api/admin/elite-eval
 *
 * Body:
 *   {
 *     "job_id": "<job uuid>",
 *     "candidate_ids": ["<uuid>", ...]
 *   }
 *
 * Protected: admin only.
 * Gate: feature flag 'elite.calibration' must be enabled.
 *
 * Uses elite-ats-engine.runEliteMatching to score candidates for a job and
 * returns matches + stats without mutating candidate_job_matches.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireAdmin } from '@/lib/api-auth';
import { runEliteMatching, type EliteJob, type EliteCandidate } from '@/lib/elite-ats-engine';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const authResult = await requireAdmin(req);
  if (authResult instanceof Response) return authResult;

  const supabase = createServiceClient();

  // Feature flag gate (reuse elite.calibration as a coarse toggle for elite tools)
  const { data: flagRow } = await supabase
    .from('feature_flags')
    .select('value')
    .eq('key', 'elite.calibration')
    .maybeSingle();
  const flagEnabled = flagRow?.value === true || flagRow?.value === 'true' || flagRow?.value === '"true"';
  if (!flagEnabled) {
    return NextResponse.json(
      { error: 'Feature flag elite.calibration is not enabled. Enable it in admin feature flags first.' },
      { status: 403 },
    );
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // ignore, will validate below
  }

  const jobId = String(body.job_id || '').trim();
  const candidateIds = Array.isArray(body.candidate_ids) ? body.candidate_ids.map(String) : [];
  if (!jobId || candidateIds.length === 0) {
    return NextResponse.json(
      { error: 'job_id and candidate_ids[] are required' },
      { status: 400 },
    );
  }

  const { data: job, error: jErr } = await supabase
    .from('jobs')
    .select('id, title, company, location, jd_clean, jd_raw, is_active, structured_requirements')
    .eq('id', jobId)
    .maybeSingle();
  if (jErr || !job) {
    return NextResponse.json(
      { error: jErr?.message || 'Job not found' },
      { status: 404 },
    );
  }

  const { data: candidates, error: cErr } = await supabase
    .from('candidates')
    .select('id, full_name, primary_title, years_of_experience, location, visa_status, parsed_resume_text')
    .in('id', candidateIds);
  if (cErr) {
    return NextResponse.json(
      { error: cErr.message },
      { status: 500 },
    );
  }
  if (!candidates || candidates.length === 0) {
    return NextResponse.json(
      { error: 'No candidates found for provided IDs' },
      { status: 404 },
    );
  }

  const eliteJob: EliteJob = {
    id: job.id,
    title: job.title,
    company: job.company,
    description: job.jd_clean || job.jd_raw || '',
    location: job.location ?? undefined,
    is_active: job.is_active ?? true,
    structured_requirements: job.structured_requirements ?? undefined,
  };

  const eliteCandidates: EliteCandidate[] = (candidates as any[]).map((c) => ({
    id: c.id,
    name: c.full_name,
    title: c.primary_title ?? undefined,
    years_experience: c.years_of_experience ?? undefined,
    location: c.location ?? undefined,
    needs_visa_sponsorship: typeof c.visa_status === 'string'
      ? /visa|sponsorship|h1b|opt|tn/i.test(c.visa_status)
      : undefined,
    resumes: [
      {
        index: 0,
        text: (c.parsed_resume_text || '').slice(0, 8000),
        resume_id: null,
      },
    ],
  }));

  const { matches, rankingInsights, stats } = await runEliteMatching([eliteJob], eliteCandidates);

  return NextResponse.json({
    ok: true,
    job_id: jobId,
    candidate_count: eliteCandidates.length,
    matches,
    ranking_insights: Array.from(rankingInsights.entries()).map(([jobIdKey, data]) => ({
      job_id: jobIdKey,
      data,
    })),
    stats,
  });
}

