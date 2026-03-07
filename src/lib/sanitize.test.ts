import { describe, it, expect } from 'vitest';
import {
  sanitizeString,
  sanitizePlainText,
  sanitizeRequiredString,
  sanitizeEmail,
  sanitizeStringRecord,
} from '@/lib/sanitize';

describe('sanitize', () => {
  describe('sanitizeString', () => {
    it('trims and strips control chars', () => {
      expect(sanitizeString('  foo  ')).toBe('foo');
      expect(sanitizeString('a\x00b')).toBe('ab');
    });
    it('returns empty for null/undefined', () => {
      expect(sanitizeString(null)).toBe('');
      expect(sanitizeString(undefined)).toBe('');
    });
    it('enforces maxLength', () => {
      expect(sanitizeString('a'.repeat(100), 10)).toHaveLength(10);
    });
  });

  describe('sanitizePlainText', () => {
    it('strips HTML tags', () => {
      expect(sanitizePlainText('<p>hello</p>')).toBe('hello');
      expect(sanitizePlainText('<script>x</script>')).toBe('x');
    });
  });

  describe('sanitizeRequiredString', () => {
    it('returns null for empty', () => {
      expect(sanitizeRequiredString('')).toBeNull();
      expect(sanitizeRequiredString('   ')).toBeNull();
    });
    it('returns trimmed string when non-empty', () => {
      expect(sanitizeRequiredString(' ok ')).toBe('ok');
    });
  });

  describe('sanitizeEmail', () => {
    it('accepts valid email', () => {
      expect(sanitizeEmail('a@b.co')).toBe('a@b.co');
    });
    it('returns null for invalid', () => {
      expect(sanitizeEmail('notanemail')).toBeNull();
      expect(sanitizeEmail('')).toBeNull();
    });
  });

  describe('sanitizeStringRecord', () => {
    it('returns only allowed keys with string values', () => {
      expect(sanitizeStringRecord({ a: 'x', b: 1 })).toEqual({ a: 'x', b: '1' });
    });
    it('returns empty for non-object', () => {
      expect(sanitizeStringRecord(null)).toEqual({});
      expect(sanitizeStringRecord([])).toEqual({});
    });
  });
});
