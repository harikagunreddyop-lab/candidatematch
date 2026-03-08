/**
 * Matching service — re-exports and thin wrappers for matching operations.
 * Use from cron/API routes that need to run matching or ATS checks.
 */

import {
  runMatching,
  runMatchingForJobs,
  runAtsCheck,
  runAtsCheckBatch,
  runAtsCheckPasted,
  precomputeJobRequirements,
} from '@/lib/matching';

export {
  runMatching,
  runMatchingForJobs,
  runAtsCheck,
  runAtsCheckBatch,
  runAtsCheckPasted,
  precomputeJobRequirements,
};
