/**
 * Job service — high-level job operations for API routes.
 * Uses service-role Supabase; auth/authorization is the caller's responsibility.
 */

import { createServiceClient } from '@/lib/supabase-server';

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

const supabase = () => createServiceClient();

/** Get job by id. */
export async function getJobById(id: string): Promise<JobRow | null> {
  const { data } = await supabase()
    .from('jobs')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  return data as JobRow | null;
}

/** List active jobs for a company (paginated). */
export async function listJobsByCompany(
  companyId: string,
  options?: { activeOnly?: boolean; limit?: number; offset?: number }
): Promise<{ jobs: JobRow[]; total?: number }> {
  const { activeOnly = true, limit = 50, offset = 0 } = options ?? {};
  let q = supabase()
    .from('jobs')
    .select('*', { count: 'exact' })
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (activeOnly) q = q.eq('is_active', true);
  const { data, error, count } = await q;
  if (error) return { jobs: [] };
  return { jobs: (data as JobRow[]) ?? [], total: count ?? undefined };
}

/** Create a job for a company. Caller must enforce plan limits and sanitize inputs. */
export async function createJobForCompany(
  companyId: string,
  postedBy: string,
  payload: {
    title: string;
    company?: string | null;
    location?: string | null;
    url?: string | null;
    jd_raw?: string | null;
    jd_clean?: string | null;
    dedupe_hash?: string | null;
    source?: string;
  }
): Promise<{ job: JobRow } | { error: string }> {
  const now = new Date().toISOString();
  const { data, error } = await supabase()
    .from('jobs')
    .insert({
      source: payload.source ?? 'company',
      title: payload.title,
      company: payload.company ?? null,
      company_id: companyId,
      location: payload.location ?? null,
      url: payload.url ?? null,
      jd_raw: payload.jd_raw ?? null,
      jd_clean: payload.jd_clean ?? null,
      dedupe_hash: payload.dedupe_hash ?? null,
      is_active: true,
      posted_by: postedBy,
      scraped_at: now,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();
  if (error) return { error: error.message };
  return { job: data as JobRow };
}

/** Update job by id. */
export async function updateJob(
  id: string,
  updates: Partial<Omit<JobRow, 'id' | 'created_at'>>
): Promise<{ job: JobRow } | { error: string }> {
  const { data, error } = await supabase()
    .from('jobs')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) return { error: error.message };
  return { job: data as JobRow };
}
