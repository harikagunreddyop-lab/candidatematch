/**
 * Base repository — generic CRUD over Supabase (service role).
 * Repositories extend this with typed table names and row types.
 */

import { createServiceClient } from '@/lib/supabase-server';

export type SupabaseClient = ReturnType<typeof createServiceClient>;

export function getSupabase(): SupabaseClient {
  return createServiceClient();
}

/** Get a single row by primary key (id). */
export async function getById<T extends Record<string, unknown>>(
  supabase: SupabaseClient,
  table: string,
  id: string,
  select = '*'
): Promise<T | null> {
  const { data } = await supabase.from(table).select(select).eq('id', id).maybeSingle();
  return data as T | null;
}

/** List rows with optional filters and pagination. */
export async function list<T extends Record<string, unknown>>(
  supabase: SupabaseClient,
  table: string,
  filters: Record<string, unknown> = {},
  options: { orderBy?: string; ascending?: boolean; limit?: number; offset?: number } = {}
): Promise<T[]> {
  let q = supabase.from(table).select('*');
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined) continue;
    if (value === null) q = q.is(key, null);
    else if (Array.isArray(value)) q = q.in(key, value);
    else q = q.eq(key, value);
  }
  if (options.orderBy) q = q.order(options.orderBy, { ascending: options.ascending ?? true });
  if (options.limit != null) q = q.range(options.offset ?? 0, (options.offset ?? 0) + options.limit - 1);
  const { data } = await q;
  return (data as T[]) ?? [];
}

/** Insert one row; returns inserted row with id. */
export async function create<T extends Record<string, unknown>>(
  supabase: SupabaseClient,
  table: string,
  payload: Record<string, unknown>
): Promise<{ data: T } | { error: string }> {
  const { data, error } = await supabase.from(table).insert(payload).select().single();
  if (error) return { error: error.message };
  return { data: data as T };
}

/** Update one row by id; returns updated row. */
export async function update<T extends Record<string, unknown>>(
  supabase: SupabaseClient,
  table: string,
  id: string,
  payload: Record<string, unknown>
): Promise<{ data: T } | { error: string }> {
  const { data, error } = await supabase.from(table).update(payload).eq('id', id).select().single();
  if (error) return { error: error.message };
  return { data: data as T };
}

/** Delete one row by id. */
export async function remove(
  supabase: SupabaseClient,
  table: string,
  id: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.from(table).delete().eq('id', id);
  return { error: error?.message ?? null };
}
