/**
 * BullMQ Redis connection — uses URL string to avoid ioredis version conflicts.
 *
 * BullMQ bundles its own ioredis internally. Passing an external ioredis instance
 * causes type conflicts. Using the URL string lets BullMQ create its own instance.
 */

/**
 * Returns connection options for BullMQ queues and workers.
 * Uses REDIS_URL env var. When unset, queues are disabled and this returns null.
 */
function shouldEmitOperationalWarnings(): boolean {
  return process.env.NEXT_PHASE !== 'phase-production-build';
}

export function getQueueConnection() {
    const url = process.env.REDIS_URL;
    if (!url) {
        if (shouldEmitOperationalWarnings()) {
            console.warn('[queue] REDIS_URL not set — BullMQ queues are disabled.');
        }
        return null;
    }
    return {
        connection: {
            url,
            maxRetriesPerRequest: null as null,
        },
    };
}
