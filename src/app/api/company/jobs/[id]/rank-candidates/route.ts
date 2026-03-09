/**
 * POST /api/company/jobs/[id]/rank-candidates — AI rank candidates for a job.
 * Optionally uses Claude; falls back to ATS/match scores. Stores results in ai_candidate_scores.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireApiAuth } from '@/lib/api-auth';
import { handleAPIError } from '@/lib/errors';
import { callClaude, CLAUDE_FAST } from '@/lib/ai/anthropic';
import type { RankedCandidate } from '@/types/pipeline';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireApiAuth(req, { effectiveRoles: ['platform_admin', 'company_admin', 'recruiter'] });
    if (authResult instanceof NextResponse) return authResult;
    const companyId = authResult.profile.company_id;
    if (!companyId)
      return NextResponse.json({ error: 'No company context' }, { status: 403 });

    const { id: jobId } = await params;
    if (!jobId) return NextResponse.json({ error: 'job id required' }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const candidates: string[] = Array.isArray(body.candidates) ? body.candidates : [];
    if (candidates.length === 0)
      return NextResponse.json({ error: 'candidates array required' }, { status: 400 });

    const supabase = createServiceClient();

    const { data: job } = await supabase
      .from('jobs')
      .select('id, title, company, jd_clean, company_id')
      .eq('id', jobId)
      .single();
    if (!job || job.company_id !== companyId)
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });

    const { data: candidateRows } = await supabase
      .from('candidates')
      .select('id, full_name, primary_title, summary, years_of_experience, skills, location')
      .in('id', candidates);
    const candidateList = candidateRows ?? [];
    if (candidateList.length === 0)
      return NextResponse.json({ ranking: [], error: 'No valid candidates' });

    const { data: matches } = await supabase
      .from('candidate_job_matches')
      .select('candidate_id, ats_score, ats_breakdown')
      .eq('job_id', jobId)
      .in('candidate_id', candidates);
    const matchMap = new Map<string, { ats_score: number; ats_breakdown?: unknown }>(
      (matches ?? []).map((m: { candidate_id: string; ats_score?: number; ats_breakdown?: unknown }) => [
        m.candidate_id,
        { ats_score: m.ats_score ?? 0, ats_breakdown: m.ats_breakdown },
      ])
    );

    let ranking: RankedCandidate[];

    if (process.env.ANTHROPIC_API_KEY) {
      try {
        const prompt = `You are a recruiter assistant. Rank these candidates for the job below. Return ONLY a valid JSON array, no markdown or explanation. Each object must have: candidate_id (string), rank (1-based integer), score (0-100), strengths (array of up to 3 strings), weaknesses (array of up to 3 strings), recommendation (one of: "strong_hire", "maybe", "pass").

Job: ${job.title} at ${job.company || 'Company'}
Job description (excerpt): ${(job.jd_clean || '').slice(0, 1500)}

Candidates (id, name, title, experience, skills, summary):
${candidateList
  .map(
    (c: { id: string; full_name?: string; primary_title?: string; years_of_experience?: number; skills?: string[]; summary?: string }) =>
      `${c.id}|${c.full_name || 'N/A'}|${c.primary_title || 'N/A'}|${c.years_of_experience ?? 'N/A'} years|${(c.skills || []).join(', ')}|${(c.summary || '').slice(0, 300)}`
  )
  .join('\n')}

Return the JSON array ordered by rank (best first). candidate_id must match the first column (id) from the list above.`;
        const text = await callClaude(prompt, { model: CLAUDE_FAST, maxTokens: 2000 });
        const parsed = JSON.parse(text.replace(/^[\s\S]*?\[/, '[').replace(/\][\s\S]*$/, ']')) as RankedCandidate[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          ranking = parsed.map((r, i) => ({
            candidate_id: r.candidate_id,
            rank: r.rank ?? i + 1,
            score: typeof r.score === 'number' ? r.score : 70,
            strengths: Array.isArray(r.strengths) ? r.strengths : [],
            weaknesses: Array.isArray(r.weaknesses) ? r.weaknesses : [],
            recommendation: ['strong_hire', 'maybe', 'pass'].includes(r.recommendation) ? r.recommendation : 'maybe',
          }));
        } else {
          ranking = fallbackRank(candidateList, jobId, matchMap);
        }
      } catch {
        ranking = fallbackRank(candidateList, jobId, matchMap);
      }
    } else {
      ranking = fallbackRank(candidateList, jobId, matchMap);
    }

    const todayStart = new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z';
    const todayEnd = new Date().toISOString().slice(0, 10) + 'T23:59:59.999Z';
    for (const r of ranking) {
      await supabase
        .from('ai_candidate_scores')
        .delete()
        .eq('candidate_id', r.candidate_id)
        .eq('job_id', jobId)
        .gte('scored_at', todayStart)
        .lte('scored_at', todayEnd);
      await supabase.from('ai_candidate_scores').insert({
        candidate_id: r.candidate_id,
        job_id: jobId,
        overall_score: r.score,
        reasoning: {
          strengths: r.strengths,
          weaknesses: r.weaknesses,
          recommendation: r.recommendation,
        },
        scored_at: new Date().toISOString(),
      });
    }

    return NextResponse.json({ ranking });
  } catch (e) {
    return handleAPIError(e);
  }
}

function fallbackRank(
  candidateList: { id: string }[],
  _jobId: string,
  matchMap: Map<string, { ats_score: number; ats_breakdown?: unknown }>
): RankedCandidate[] {
  const withScore = candidateList.map((c) => ({
    candidate: c,
    ats: matchMap.get(c.id)?.ats_score ?? 50,
  }));
  withScore.sort((a, b) => b.ats - a.ats);
  return withScore.map((item, i) => ({
    candidate_id: item.candidate.id,
    rank: i + 1,
    score: item.ats,
    strengths: [],
    weaknesses: [],
    recommendation: item.ats >= 75 ? 'strong_hire' : item.ats >= 50 ? 'maybe' : 'pass',
  }));
}
