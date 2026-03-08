/**
 * Match repository — typed access to candidate_job_matches table.
 * Composite key (candidate_id, job_id); list by candidate or job.
 */

import { createServiceClient } from '@/lib/supabase-server';

export type MatchRow = {
  candidate_id: string;
  job_id: string;
  fit_score: number | null;
  match_reason: string | null;
  matched_at: string | null;
  [key: string]: unknown;
};

const TABLE = 'candidate_job_matches';

function supabase() {
  return createServiceClient();
}

export async function getMatch(candidateId: string, jobId: string): Promise<MatchRow | null> {
  const { data } = await supabase()
    .from(TABLE)
    .select('*')
    .eq('candidate_id', candidateId)
    .eq('job_id', jobId)
    .maybeSingle();
  return data as MatchRow | null;
}

export async function listMatchesByCandidate(candidateId: string, options?: { limit?: number }): Promise<MatchRow[]> {
  const { data } = await supabase()
    .from(TABLE)
    .select('*')
    .eq('candidate_id', candidateId)
    .order('fit_score', { ascending: false })
    .limit(options?.limit ?? 100);
  return (data as MatchRow[]) ?? [];
}

export async function listMatchesByJob(jobId: string, options?: { limit?: number }): Promise<MatchRow[]> {
  const { data } = await supabase()
    .from(TABLE)
    .select('*')
    .eq('job_id', jobId)
    .order('fit_score', { ascending: false })
    .limit(options?.limit ?? 100);
  return (data as MatchRow[]) ?? [];
}
