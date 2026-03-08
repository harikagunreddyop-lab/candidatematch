/**
 * Candidate repository — typed access to candidates table.
 */

import { getSupabase, getById, list, create, update, type SupabaseClient } from './base';

export type CandidateRow = {
  id: string;
  user_id: string | null;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  primary_title: string | null;
  skills: string[] | null;
  experience: unknown;
  education: unknown;
  active: boolean | null;
  onboarding_completed: boolean | null;
  created_at: string | null;
  updated_at: string | null;
  [key: string]: unknown;
};

const TABLE = 'candidates';

export async function getCandidateById(id: string): Promise<CandidateRow | null> {
  return getById<CandidateRow>(getSupabase(), TABLE, id);
}

export async function getCandidateByUserId(userId: string): Promise<CandidateRow | null> {
  const rows = await list<CandidateRow>(getSupabase(), TABLE, { user_id: userId }, { limit: 1, orderBy: 'updated_at', ascending: false });
  return rows[0] ?? null;
}

export async function listCandidates(filters: { user_id?: string; email?: string; active?: boolean }, options?: { limit?: number; offset?: number }): Promise<CandidateRow[]> {
  return list<CandidateRow>(getSupabase(), TABLE, filters, { orderBy: 'updated_at', ascending: false, ...options });
}

export async function createCandidate(supabase: SupabaseClient, payload: Record<string, unknown>): Promise<{ data: CandidateRow } | { error: string }> {
  return create<CandidateRow>(supabase, TABLE, payload);
}

export async function updateCandidate(supabase: SupabaseClient, id: string, payload: Record<string, unknown>): Promise<{ data: CandidateRow } | { error: string }> {
  return update<CandidateRow>(supabase, TABLE, id, payload);
}
