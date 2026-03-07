#!/usr/bin/env npx tsx
/**
 * Run the JD extract BullMQ worker.
 * Requires REDIS_URL to be set.
 */
import { createJdExtractWorker } from '../src/queue/workers/jd-extract.worker';

const worker = createJdExtractWorker();
console.log('[jd-extract] Worker started. Press Ctrl+C to stop.');

process.on('SIGINT', async () => {
  await worker.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await worker.close();
  process.exit(0);
});
