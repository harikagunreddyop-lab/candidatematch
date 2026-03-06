/**
 * Rate limiting for API routes.
 *
 * Strategy:
 *   1. If Redis is available → uses Redis INCR + EXPIRE (survives cold starts)
 *   2. If Redis unavailable → falls back to in-memory Map (dev mode)
 */
import { getRedis } from './redis';

// ── In-memory fallback ──────────────────────────────────────────────────────

type Window = { count: number; resetAt: number };
const memStore = new Map<string, Window>();
let lastCleanup = 0;

function memCleanup() {
  const now = Date.now();
  if (now - lastCleanup < 60_000) return;
  lastCleanup = now;
  memStore.forEach((w, key) => {
    if (w.resetAt < now) memStore.delete(key);
  });
}

// ── Config ──────────────────────────────────────────────────────────────────

export function getClientId(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  return forwarded ? forwarded.split(',')[0].trim() : (req.headers.get('x-real-ip') || 'unknown');
}

export interface RateLimitConfig {
  windowMs: number;
  max: number;
  keyPrefix?: string;
}

const PRESETS: Record<string, RateLimitConfig> = {
  auth: { windowMs: 60_000, max: 10, keyPrefix: 'rl:auth' },
  api: { windowMs: 60_000, max: 120, keyPrefix: 'rl:api' },
  ats: { windowMs: 60_000, max: 20, keyPrefix: 'rl:ats' },
  admin_heavy: { windowMs: 60_000, max: 10, keyPrefix: 'rl:adm' },
};

// ── Redis-backed check ──────────────────────────────────────────────────────

async function redisCheck(
  key: string,
  windowMs: number,
  max: number,
): Promise<{ allowed: boolean; retryAfter?: number }> {
  const redis = getRedis();
  if (!redis) return memCheck(key, windowMs, max);

  try {
    const count = await redis.incr(key);
    if (count === 1) {
      // First request in window — set expiry
      await redis.pexpire(key, windowMs);
    }
    if (count > max) {
      const ttl = await redis.pttl(key);
      return { allowed: false, retryAfter: Math.ceil(Math.max(ttl, 0) / 1000) };
    }
    return { allowed: true };
  } catch {
    // Redis failed mid-check → fall back to memory
    return memCheck(key, windowMs, max);
  }
}

// ── In-memory check ─────────────────────────────────────────────────────────

function memCheck(
  key: string,
  windowMs: number,
  max: number,
): { allowed: boolean; retryAfter?: number } {
  memCleanup();
  const now = Date.now();
  let w = memStore.get(key);
  if (!w || w.resetAt < now) {
    w = { count: 1, resetAt: now + windowMs };
    memStore.set(key, w);
    return { allowed: true };
  }
  w.count++;
  if (w.count > max) {
    return { allowed: false, retryAfter: Math.ceil((w.resetAt - now) / 1000) };
  }
  return { allowed: true };
}

// ── Public API (unchanged signatures) ───────────────────────────────────────

export async function checkRateLimit(
  clientId: string,
  preset: keyof typeof PRESETS,
  userId?: string | null,
): Promise<{ allowed: boolean; retryAfter?: number }> {
  const c = PRESETS[preset];
  if (!c) return { allowed: true };
  const key = `${c.keyPrefix}:${userId || clientId}`;
  return redisCheck(key, c.windowMs, c.max);
}

/** Returns 429 Response if rate limited; otherwise null. Use before heavy work. */
export async function rateLimitResponse(
  req: Request,
  preset: keyof typeof PRESETS,
  userId?: string | null,
): Promise<Response | null> {
  const clientId = getClientId(req);
  const r = await checkRateLimit(clientId, preset, userId);
  if (!r.allowed) {
    return new Response(
      JSON.stringify({ error: 'Too many requests', retry_after: r.retryAfter }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(r.retryAfter ?? 60),
        },
      },
    );
  }
  return null;
}
