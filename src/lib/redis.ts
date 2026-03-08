/**
 * Shared Redis: Upstash (caching + rate limit) + ioredis (BullMQ).
 * Re-exports Upstash from redis-upstash so Node routes can import from here.
 * Edge routes should import from @/lib/redis-upstash to avoid loading ioredis.
 */
export { upstash, cached, invalidateCache, incrementCounter } from './redis-upstash';
import RedisIo from 'ioredis';

// =============================================
// IOREDIS (BullMQ queues)
// =============================================

let _redis: RedisIo | null = null;
let _connectionFailed = false;

/**
 * Returns a lazy singleton Redis instance.
 * Returns null if Redis is unavailable (graceful degradation for dev).
 */
export function getRedis(): RedisIo | null {
    if (_connectionFailed) return null;
    if (_redis) return _redis;

    const url = process.env.REDIS_URL;
    if (!url) {
        _connectionFailed = true;
        return null;
    }
    try {
        _redis = new RedisIo(url, {
            maxRetriesPerRequest: 3,
            lazyConnect: true,
            enableReadyCheck: true,
            retryStrategy(times) {
                if (times > 3) {
                    console.warn('[redis] giving up after 3 retries — falling back to in-memory');
                    _connectionFailed = true;
                    return null;
                }
                return Math.min(times * 200, 2000);
            },
        });

        _redis.on('error', (err) => {
            if (!_connectionFailed) {
                console.warn('[redis] connection error:', err.message);
            }
        });

        _redis.on('connect', () => {
            // Connection success — no log in production to avoid noise
        });

        // Eagerly connect so we know if it fails
        _redis.connect().catch(() => {
            _connectionFailed = true;
            _redis = null;
        });
    } catch {
        _connectionFailed = true;
        return null;
    }

    return _redis;
}

/**
 * Returns the Redis connection for BullMQ (requires Redis to be available).
 * Throws if Redis is unavailable.
 */
export function getRedisForQueue(): RedisIo {
    const r = getRedis();
    if (!r) throw new Error('Redis is required for queue operations but is unavailable');
    return r;
}
