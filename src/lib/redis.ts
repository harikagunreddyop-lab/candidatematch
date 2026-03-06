/**
 * Shared Redis connection for rate limiting, BullMQ queues, and caching.
 *
 * Config:
 *   REDIS_URL  — full connection string (e.g. redis://user:pass@host:port)
 *                Falls back to localhost:6379 for local dev.
 */
import Redis from 'ioredis';

let _redis: Redis | null = null;
let _connectionFailed = false;

/**
 * Returns a lazy singleton Redis instance.
 * Returns null if Redis is unavailable (graceful degradation for dev).
 */
export function getRedis(): Redis | null {
    if (_connectionFailed) return null;
    if (_redis) return _redis;

    const url = process.env.REDIS_URL;
    if (!url) {
        // Redis not configured; disable Redis-backed features gracefully.
        _connectionFailed = true;
        return null;
    }
    try {
        _redis = new Redis(url, {
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
            console.log('[redis] connected to', url.replace(/\/\/.*@/, '//<redacted>@'));
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
export function getRedisForQueue(): Redis {
    const r = getRedis();
    if (!r) throw new Error('Redis is required for queue operations but is unavailable');
    return r;
}
