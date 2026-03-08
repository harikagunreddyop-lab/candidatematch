/**
 * Application repository — typed access to applications table.
 */

import { getSupabase, getById, list, create, update, type SupabaseClient } from './base';

export type ApplicationRow = {
  id: string;
  candidate_id: string;
  job_id: string;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
  [key: string]: unknown;
};

const TABLE = 'applications';

export async function getApplicationById(id: string): Promise<ApplicationRow | null> {
  return getById<ApplicationRow>(getSupabase(), TABLE, id);
}

export async function listApplicationsByCandidate(candidateId: string, options?: { limit?: number; offset?: number }): Promise<ApplicationRow[]> {
  return list<ApplicationRow>(getSupabase(), TABLE, { candidate_id: candidateId }, {
    orderBy: 'created_at',
    ascending: false,
    ...options,
  });
}

export async function listApplicationsByJob(jobId: string, options?: { limit?: number; offset?: number }): Promise<ApplicationRow[]> {
  return list<ApplicationRow>(getSupabase(), TABLE, { job_id: jobId }, {
    orderBy: 'created_at',
    ascending: false,
    ...options,
  });
}

export async function createApplication(supabase: SupabaseClient, payload: Record<string, unknown>): Promise<{ data: ApplicationRow } | { error: string }> {
  return create<ApplicationRow>(supabase, TABLE, payload);
}

export async function updateApplication(supabase: SupabaseClient, id: string, payload: Record<string, unknown>): Promise<{ data: ApplicationRow } | { error: string }> {
  return update<ApplicationRow>(supabase, TABLE, id, payload);
}
