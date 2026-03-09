/**
 * Security utilities: timing-safe comparison, input validation, sanitization, IP blocking.
 */

import { createHmac, timingSafeEqual } from 'crypto';
import { upstash } from './redis-upstash';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const BLOCK_DURATION = 60 * 60; // 1 hour in seconds
const MAX_FAILED_ATTEMPTS = 10;

/** Timing-safe string comparison (constant time) */
export function secureCompare(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  try {
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/** Validate UUID format */
export function isValidUuid(s: unknown): s is string {
  return typeof s === 'string' && UUID_REGEX.test(s);
}

/** Sanitize string for safe display (max length, trim) */
export function sanitizeString(s: unknown, maxLen = 1000): string {
  if (s == null) return '';
  const str = String(s).trim().slice(0, maxLen);
  return str;
}

/** Validate CRON auth header with timing-safe comparison */
export function validateCronAuth(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) return false;
  const token = auth.slice(7);
  return secureCompare(token, secret);
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function signTrackingPayload(payload: string, secret: string): string {
  return createHmac('sha256', secret)
    .update(payload)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export function createTrackingSignature(parts: Array<string | null | undefined>, secret: string): string {
  const payload = base64UrlEncode(parts.map((p) => p ?? '').join('|'));
  return signTrackingPayload(payload, secret);
}

export function verifyTrackingSignature(
  parts: Array<string | null | undefined>,
  signature: string | null,
  secret: string | undefined
): boolean {
  if (!secret || !signature) return false;
  const expected = createTrackingSignature(parts, secret);
  return secureCompare(signature, expected);
}

/** Parse and validate JSON body with size limit */
export function parseJsonBody<T>(body: string, maxBytes = 100_000): T | null {
  if (typeof body !== 'string' || body.length > maxBytes) return null;
  try {
    return JSON.parse(body) as T;
  } catch {
    return null;
  }
}

// ── IP blocking (brute-force protection) ─────────────────────────────────────

/** Track a failed auth attempt for an IP. Returns true if IP was just blocked. */
export async function trackFailedAttempt(ip: string): Promise<boolean> {
  if (!upstash) return false;
  try {
    const key = `failed_attempts:${ip}`;
    const count = await upstash.incr(key);
    if (count === 1) await upstash.expire(key, BLOCK_DURATION);
    if (count >= MAX_FAILED_ATTEMPTS) {
      await blockIP(ip);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** Block an IP for BLOCK_DURATION. */
export async function blockIP(ip: string, durationSeconds = BLOCK_DURATION): Promise<void> {
  if (!upstash) return;
  try {
    await upstash.setex(`blocked_ip:${ip}`, durationSeconds, '1');
  } catch {
    // ignore
  }
}

/** Check if an IP is currently blocked. */
export async function isIPBlocked(ip: string): Promise<boolean> {
  if (!upstash) return false;
  try {
    const v = await upstash.get(`blocked_ip:${ip}`);
    return v !== null;
  } catch {
    return false;
  }
}

/** Remove block and failed-attempt count for an IP. */
export async function unblockIP(ip: string): Promise<void> {
  if (!upstash) return;
  try {
    await upstash.del(`blocked_ip:${ip}`);
    await upstash.del(`failed_attempts:${ip}`);
  } catch {
    // ignore
  }
}
