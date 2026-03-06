/**
 * Week 1 bulk promotion facade.
 *
 * This thin wrapper exists so that we can evolve a more
 * optimized bulk promotion path in Week 2+ without changing
 * all call sites again. For now it simply delegates to the
 * existing, well-tested promoteIngestJobs implementation.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { promoteIngestJobs } from './promote';

export async function promoteIngestJobsBulk(
  supabase: SupabaseClient,
  ingestJobIds: string[]
): Promise<{ promoted: number; newJobIds: string[] }> {
  return promoteIngestJobs(supabase, ingestJobIds);
}

