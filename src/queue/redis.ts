/**
 * BullMQ Redis connection — uses URL string to avoid ioredis version conflicts.
 *
 * BullMQ bundles its own ioredis internally. Passing an external ioredis instance
 * causes type conflicts. Using the URL string lets BullMQ create its own instance.
 */

/**
 * Returns connection options for BullMQ queues and workers.
 * Uses REDIS_URL env var or defaults to localhost:6379.
 */
export function getQueueConnection() {
    const url = process.env.REDIS_URL || 'redis://localhost:6379';
    return {
        connection: {
            url,
            maxRetriesPerRequest: null as null,
        },
    };
}
