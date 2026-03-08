import { describe, it, expect } from 'vitest';
import { stripHtml, contentHash, sha256 } from './types';

describe('stripHtml', () => {
  it('strips HTML tags', () => {
    expect(stripHtml('<p>Hello</p>')).toBe('Hello');
    expect(stripHtml('<div><span>Foo</span></div>')).toBe('Foo');
  });

  it('decodes HTML entities', () => {
    expect(stripHtml('&amp;')).toBe('&');
    expect(stripHtml('&lt;test&gt;')).toBe('<test>');
    expect(stripHtml('&quot;quoted&quot;')).toBe('"quoted"');
    expect(stripHtml("&#39;apos&#39;")).toBe("'apos'");
    expect(stripHtml('foo&nbsp;bar')).toBe('foo bar');
  });

  it('collapses whitespace', () => {
    expect(stripHtml('  foo   bar  ')).toBe('foo bar');
  });

  it('returns empty for null/empty', () => {
    expect(stripHtml('')).toBe('');
    expect(stripHtml('   ')).toBe('');
  });

  it('strips script and style', () => {
    expect(stripHtml('<script>alert(1)</script>hello')).toBe('hello');
    expect(stripHtml('<style>.x{}</style>hello')).toBe('hello');
  });
});

describe('contentHash', () => {
  it('produces stable sha256 hex string', () => {
    const hash = contentHash({
      title: 'Engineer',
      location_raw: 'NYC',
      department: 'Eng',
      description_text: 'Build stuff',
      apply_url: 'https://example.com/apply',
      updated_at: '2024-01-01T00:00:00Z',
    });
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('same inputs produce same hash', () => {
    const input = {
      title: 'Engineer',
      location_raw: 'NYC',
      department: null,
      description_text: 'Build',
      apply_url: 'https://x.com',
      updated_at: null,
    };
    expect(contentHash(input)).toBe(contentHash(input));
  });

  it('different inputs produce different hash', () => {
    const a = contentHash({ title: 'A', location_raw: null, department: null, description_text: '', apply_url: 'x', updated_at: null });
    const b = contentHash({ title: 'B', location_raw: null, department: null, description_text: '', apply_url: 'x', updated_at: null });
    expect(a).not.toBe(b);
  });

  it('truncates description to 5000 chars for hash', () => {
    const long = 'x'.repeat(10000);
    const h1 = contentHash({ title: 'T', location_raw: null, department: null, description_text: long, apply_url: 'u', updated_at: null });
    const h2 = contentHash({ title: 'T', location_raw: null, department: null, description_text: long.slice(0, 5000), apply_url: 'u', updated_at: null });
    expect(h1).toBe(h2);
  });
});

describe('sha256', () => {
  it('returns 64-char hex', () => {
    expect(sha256('test')).toMatch(/^[a-f0-9]{64}$/);
  });

  it('same input same output', () => {
    expect(sha256('hello')).toBe(sha256('hello'));
  });
});
