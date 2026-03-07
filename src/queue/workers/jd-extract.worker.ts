/**
 * JD Extract Worker — BullMQ worker for job requirements extraction.
 * Runs precomputeJobRequirements for newly promoted jobs without blocking ingest.
 */
import { Worker } from 'bullmq';
import { getQueueConnection } from '../redis';
import { createServiceClient } from '@/lib/supabase-server';
import { precomputeJobRequirements } from '@/lib/matching';
import { log, error as logError } from '@/lib/logger';

export type JdExtractJobData = {
  jobIds: string[];
};

function createJdExtractWorker() {
  const queueConn = getQueueConnection();
  if (!queueConn) {
    throw new Error('Queue pipeline is not configured (REDIS_URL not set)');
  }

  const worker = new Worker<JdExtractJobData>(
    'jd-extract',
    async (job) => {
      const { jobIds } = job.data;
      if (!jobIds?.length) return { processed: 0 };

      const supabase = createServiceClient();
      try {
        await precomputeJobRequirements(supabase, jobIds);
        log(`[jd-extract] Processed ${jobIds.length} jobs`);
        return { processed: jobIds.length };
      } catch (err) {
        logError('[jd-extract] precomputeJobRequirements failed:', err);
        throw err;
      }
    },
    {
      ...queueConn,
      concurrency: 2,
    }
  );

  worker.on('failed', (job, err) => {
    logError(`[jd-extract] Job ${job?.id} failed:`, err?.message ?? String(err));
  });

  return worker;
}

export { createJdExtractWorker };
