/**
 * Adapter registry for Type-B job board providers.
 */

import type { PublicJobsAdapter, Provider } from './types';
import { greenhouse } from './greenhouse';
import { lever } from './lever';
import { ashby } from './ashby';

export const adapters: Record<Provider, PublicJobsAdapter> = {
  greenhouse,
  lever,
  ashby,
};

export type { CanonicalJob, Connector, ListItem, PublicJobsAdapter, Provider } from './types';
export { stripHtml, sha256, contentHash, fetchWithRetry } from './types';
