/**
 * In-memory rate limiting for API routes.
 */

type Window = { count: number; resetAt: number };
const store = new Map<string, Window>();
let lastCleanup = 0;

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < 60000) return;
  lastCleanup = now;
  store.forEach((w, key) => {
    if (w.resetAt < now) store.delete(key);
  });
}

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
  auth: { windowMs: 60000, max: 10, keyPrefix: 'auth' },
  api: { windowMs: 60000, max: 120, keyPrefix: 'api' },
};

export function checkRateLimit(
  clientId: string,
  preset: keyof typeof PRESETS,
  userId?: string | null
): { allowed: boolean; retryAfter?: number } {
  cleanup();
  const c = PRESETS[preset];
  if (!c) return { allowed: true };
  const key = `${c.keyPrefix}:${userId || clientId}`;
  const now = Date.now();
  let w = store.get(key);
  if (!w || w.resetAt < now) {
    w = { count: 1, resetAt: now + c.windowMs };
    store.set(key, w);
    return { allowed: true };
  }
  w.count++;
  if (w.count > c.max) {
    return { allowed: false, retryAfter: Math.ceil((w.resetAt - now) / 1000) };
  }
  return { allowed: true };
}

/** Returns 429 Response if rate limited; otherwise null. Use before heavy work. */
export function rateLimitResponse(
  req: Request,
  preset: keyof typeof PRESETS,
  userId?: string | null
): Response | null {
  const clientId = getClientId(req);
  const r = checkRateLimit(clientId, preset, userId);
  if (!r.allowed) {
    return new Response(
      JSON.stringify({ error: 'Too many requests', retry_after: r.retryAfter }),
      { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': String(r.retryAfter ?? 60) } }
    );
  }
  return null;
}
