/**
 * Job repository — typed access to jobs table.
 */

import { getSupabase, getById, list, create, update, type SupabaseClient } from './base';

export type JobRow = {
  id: string;
  source: string | null;
  title: string | null;
  company: string | null;
  company_id: string | null;
  location: string | null;
  url: string | null;
  jd_raw: string | null;
  jd_clean: string | null;
  is_active: boolean | null;
  posted_by: string | null;
  created_at: string | null;
  updated_at: string | null;
  [key: string]: unknown;
};

const TABLE = 'jobs';

export async function getJobById(id: string): Promise<JobRow | null> {
  return getById<JobRow>(getSupabase(), TABLE, id);
}

export async function listJobsByCompany(companyId: string, options?: { activeOnly?: boolean; limit?: number; offset?: number }): Promise<JobRow[]> {
  const filters: Record<string, unknown> = { company_id: companyId };
  if (options?.activeOnly !== false) filters.is_active = true;
  return list<JobRow>(getSupabase(), TABLE, filters, {
    orderBy: 'created_at',
    ascending: false,
    limit: options?.limit ?? 50,
    offset: options?.offset ?? 0,
  });
}

export async function createJob(supabase: SupabaseClient, payload: Record<string, unknown>): Promise<{ data: JobRow } | { error: string }> {
  return create<JobRow>(supabase, TABLE, payload);
}

export async function updateJob(supabase: SupabaseClient, id: string, payload: Record<string, unknown>): Promise<{ data: JobRow } | { error: string }> {
  return update<JobRow>(supabase, TABLE, id, payload);
}
