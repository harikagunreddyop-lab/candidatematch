#!/usr/bin/env npx tsx
/**
 * JD extract worker stub.
 *
 * ATS Engine v3 moved JD extraction into the API layer using `extractJobRequirements`
 * and the `job_requirements_cache` table. The old BullMQ worker has been removed.
 */

console.log('[jd-extract] Worker removed in ATS Engine v3. JD extraction now happens via the ATS API and job_requirements_cache.');
