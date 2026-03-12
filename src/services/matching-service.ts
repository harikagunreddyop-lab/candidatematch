/**
 * Matching service — re-exports and thin wrappers for matching operations.
 * Use from cron/API routes that need to run matching or ATS checks.
 */

import {
  runMatching,
  runMatchingForJobs,
  precomputeJobRequirements,
} from '@/lib/matching';

export {
  runMatching,
  runMatchingForJobs,
  precomputeJobRequirements,
};
