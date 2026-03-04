import { describe, it, expect } from 'vitest';
import { isValidUuid, secureCompare, sanitizeString } from '@/lib/security';

describe('isValidUuid', () => {
  it('accepts valid UUIDs', () => {
    expect(isValidUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(isValidUuid('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(true);
    expect(isValidUuid('00000000-0000-0000-0000-000000000000')).toBe(true);
  });

  it('accepts uppercase UUIDs', () => {
    expect(isValidUuid('550E8400-E29B-41D4-A716-446655440000')).toBe(true);
  });

  it('rejects invalid formats', () => {
    expect(isValidUuid('')).toBe(false);
    expect(isValidUuid('not-a-uuid')).toBe(false);
    expect(isValidUuid('550e8400-e29b-41d4-a716')).toBe(false);
    expect(isValidUuid('550e8400e29b41d4a716446655440000')).toBe(false);
    expect(isValidUuid(null)).toBe(false);
    expect(isValidUuid(undefined)).toBe(false);
    expect(isValidUuid(123)).toBe(false);
  });
});

describe('secureCompare', () => {
  it('returns true for equal strings', () => {
    expect(secureCompare('foo', 'foo')).toBe(true);
    expect(secureCompare('', '')).toBe(true);
  });

  it('returns false for different strings', () => {
    expect(secureCompare('foo', 'bar')).toBe(false);
    expect(secureCompare('foo', 'foobar')).toBe(false);
    expect(secureCompare('abc', 'abd')).toBe(false);
  });

  it('returns false for non-strings', () => {
    expect(secureCompare('a', null as any)).toBe(false);
    expect(secureCompare(1 as any, '1')).toBe(false);
  });
});

describe('sanitizeString', () => {
  it('trims and returns string', () => {
    expect(sanitizeString('  hello  ')).toBe('hello');
  });

  it('returns empty for null/undefined', () => {
    expect(sanitizeString(null)).toBe('');
    expect(sanitizeString(undefined)).toBe('');
  });

  it('converts numbers to string', () => {
    expect(sanitizeString(123)).toBe('123');
  });

  it('enforces max length', () => {
    const long = 'a'.repeat(2000);
    expect(sanitizeString(long, 100)).toHaveLength(100);
  });
});
