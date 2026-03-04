import { describe, it, expect } from 'vitest';
import { isValidJobUrl, getApplyUrl } from '@/lib/job-url';

describe('isValidJobUrl', () => {
  it('accepts valid http URLs', () => {
    expect(isValidJobUrl('http://example.com/job')).toBe(true);
  });

  it('accepts valid https URLs', () => {
    expect(isValidJobUrl('https://example.com/job')).toBe(true);
  });

  it('rejects empty, null, undefined', () => {
    expect(isValidJobUrl('')).toBe(false);
    expect(isValidJobUrl(null)).toBe(false);
    expect(isValidJobUrl(undefined)).toBe(false);
  });

  it('rejects non-http(s) URLs', () => {
    expect(isValidJobUrl('ftp://example.com')).toBe(false);
    expect(isValidJobUrl('javascript:alert(1)')).toBe(false);
  });

  it('trims whitespace', () => {
    expect(isValidJobUrl('  https://example.com/job  ')).toBe(true);
  });
});

describe('getApplyUrl', () => {
  it('returns job URL when valid', () => {
    const job = { url: 'https://company.com/apply', title: 'Engineer', company: 'Acme' };
    expect(getApplyUrl(job)).toBe('https://company.com/apply');
  });

  it('returns LinkedIn fallback when no valid URL but has title', () => {
    const job = { url: null, title: 'Software Engineer', company: 'Acme' };
    expect(getApplyUrl(job)).toContain('linkedin.com/jobs/search');
    expect(getApplyUrl(job)).toContain(encodeURIComponent('Software Engineer Acme'));
  });

  it('returns null for empty job', () => {
    expect(getApplyUrl(null)).toBe(null);
    expect(getApplyUrl({})).toBe(null);
  });

  it('returns null when job has no title or company and invalid url', () => {
    expect(getApplyUrl({ url: '', title: '', company: '' })).toBe(null);
  });
});
