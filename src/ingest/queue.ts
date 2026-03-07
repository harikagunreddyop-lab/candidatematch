/**
 * Queue JD requirements extraction.
 * Uses BullMQ when REDIS_URL is set; otherwise runs inline (fire-and-forget).
 */

import { log } from '@/lib/logger';
import { precomputeJobRequirements } from '@/lib/matching';
import { createServiceClient } from '@/lib/supabase-server';
import { jdExtractQueue } from '@/queue/queues';

/**
 * Queue JD requirements extraction.
 * Prefers BullMQ when available; falls back to direct async call.
 */
export async function queueJobRequirementsExtraction(jobIds: string[]): Promise<void> {
  if (!jobIds.length) return;

  if (jdExtractQueue) {
    log(`[QUEUE] Adding ${jobIds.length} jobs to jd-extract queue`);
    await jdExtractQueue.add('extract', { jobIds }, { attempts: 2, backoff: { type: 'exponential', delay: 5000 } });
    return;
  }

  log(`[QUEUE] Queuing ${jobIds.length} jobs for JD extraction (inline)`);
  const supabase = createServiceClient();
  precomputeJobRequirements(supabase, jobIds).catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[QUEUE] JD extraction failed:', err);
  });
}

