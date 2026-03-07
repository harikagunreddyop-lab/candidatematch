/**
 * Bulk promotion facade for ingest → jobs.
 * Delegates to promoteIngestJobs; can be optimized for larger batches if needed.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { promoteIngestJobs } from './promote';

export async function promoteIngestJobsBulk(
  supabase: SupabaseClient,
  ingestJobIds: string[]
): Promise<{ promoted: number; newJobIds: string[] }> {
  return promoteIngestJobs(supabase, ingestJobIds);
}

