/**
 * Job queue stub for Week 1 implementation.
 *
 * Week 1: Just call precomputeJobRequirements directly (but async).
 * Week 2: Replace with BullMQ queue.
 */

import { log } from '@/lib/logger';
import { precomputeJobRequirements } from '@/lib/matching';
import { createServiceClient } from '@/lib/supabase-server';

/**
 * Queue JD requirements extraction (Week 1: direct call, Week 2: BullMQ).
 */
export async function queueJobRequirementsExtraction(jobIds: string[]): Promise<void> {
  if (!jobIds.length) return;

  log(`[QUEUE] Queuing ${jobIds.length} jobs for JD extraction`);

  // Week 1: Just call async (don't block sync).
  // This will be replaced with BullMQ in Week 2.
  const supabase = createServiceClient();

  // Fire and forget (don't await).
  precomputeJobRequirements(supabase, jobIds).catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[QUEUE] JD extraction failed:', err);
  });
}

