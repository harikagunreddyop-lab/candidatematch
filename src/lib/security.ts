/**
 * Security utilities: timing-safe comparison, input validation, sanitization.
 */

import { timingSafeEqual } from 'crypto';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

/** Parse and validate JSON body with size limit */
export function parseJsonBody<T>(body: string, maxBytes = 100_000): T | null {
  if (typeof body !== 'string' || body.length > maxBytes) return null;
  try {
    return JSON.parse(body) as T;
  } catch {
    return null;
  }
}
