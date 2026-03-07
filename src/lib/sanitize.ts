/**
 * Lightweight input sanitization for API routes.
 * Use for user-supplied strings before DB or downstream use.
 */

const MAX_STRING_LENGTH = 10_000;

/**
 * Trim and limit length. Replaces control chars and null bytes.
 */
export function sanitizeString(
  value: unknown,
  maxLength: number = MAX_STRING_LENGTH
): string {
  if (value == null) return '';
  const s = String(value).replace(/\0/g, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  return s.slice(0, maxLength).trim();
}

/**
 * Sanitize for plain text (no HTML). Strips tags.
 */
export function sanitizePlainText(value: unknown, maxLength: number = 5000): string {
  const s = sanitizeString(value, maxLength);
  return s.replace(/<[^>]*>/g, '');
}

/**
 * Ensure value is a non-empty string within length; returns null if invalid.
 */
export function sanitizeRequiredString(
  value: unknown,
  maxLength: number = 2000
): string | null {
  const s = sanitizeString(value, maxLength);
  return s.length > 0 ? s : null;
}

/**
 * Sanitize email-like string (basic format check).
 */
export function sanitizeEmail(value: unknown): string | null {
  const s = sanitizeString(value, 320);
  if (!s) return null;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(s) ? s : null;
}

/**
 * Sanitize object of string values (e.g. request body).
 */
export function sanitizeStringRecord(
  obj: unknown,
  maxLengthPerValue: number = 2000
): Record<string, string> {
  if (obj == null || typeof obj !== 'object' || Array.isArray(obj)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof k === 'string' && /^[a-zA-Z0-9_-]+$/.test(k)) {
      out[k] = sanitizeString(v, maxLengthPerValue);
    }
  }
  return out;
}
