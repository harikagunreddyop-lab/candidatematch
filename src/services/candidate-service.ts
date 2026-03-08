/**
 * Candidate service — high-level candidate operations for API routes.
 * Uses service-role Supabase; auth/authorization is the caller's responsibility.
 */

import { createServiceClient } from '@/lib/supabase-server';

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

const supabase = () => createServiceClient();

/** Get candidate by user_id (e.g. for current user). */
export async function getCandidateByUserId(userId: string): Promise<CandidateRow | null> {
  const { data } = await supabase()
    .from('candidates')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as CandidateRow | null;
}

/** Get candidate by id. */
export async function getCandidateById(id: string): Promise<CandidateRow | null> {
  const { data } = await supabase()
    .from('candidates')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  return data as CandidateRow | null;
}

/** Create a candidate record. */
export async function createCandidate(payload: {
  user_id?: string | null;
  email: string;
  full_name?: string | null;
  phone?: string | null;
  primary_title?: string | null;
  skills?: string[] | null;
  experience?: unknown;
  education?: unknown;
  active?: boolean;
  onboarding_completed?: boolean;
  invite_accepted_at?: string | null;
}): Promise<{ id: string } | { error: string }> {
  const now = new Date().toISOString();
  const { data, error } = await supabase()
    .from('candidates')
    .insert({
      user_id: payload.user_id ?? null,
      email: payload.email,
      full_name: payload.full_name ?? null,
      phone: payload.phone ?? null,
      primary_title: payload.primary_title ?? null,
      skills: payload.skills ?? [],
      experience: payload.experience ?? [],
      education: payload.education ?? [],
      active: payload.active ?? true,
      onboarding_completed: payload.onboarding_completed ?? false,
      invite_accepted_at: payload.invite_accepted_at ?? null,
      created_at: now,
      updated_at: now,
    })
    .select('id')
    .single();
  if (error) return { error: error.message };
  return { id: (data as { id: string }).id };
}

/** Update candidate by id. Only provided fields are updated. */
export async function updateCandidate(
  id: string,
  updates: Partial<Omit<CandidateRow, 'id' | 'created_at'>>
): Promise<{ candidate: CandidateRow } | { error: string }> {
  const { data, error } = await supabase()
    .from('candidates')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) return { error: error.message };
  return { candidate: data as CandidateRow };
}
