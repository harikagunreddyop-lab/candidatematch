import { describe, it, expect } from 'vitest';
import { scoreReadability } from '../readability-scorer';

function baseResume(): string {
  return [
    'John Doe',
    'john@example.com',
    '(415) 555-1234',
    '',
    'Summary',
    'Software engineer with experience building web applications.',
    '',
    'Skills',
    'TypeScript, React, Node.js',
    '',
    'Experience',
    '- Built APIs in Node.js (2022-01 to 2024-01)',
    '',
    'Education',
    'B.S. Computer Science, 2020',
    '',
    'Certifications',
    'AWS Certified Developer',
  ].join('\n');
}

describe('scoreReadability', () => {
  it('clean single-column resume with all sections → band safe', () => {
    const out = scoreReadability(baseResume(), 90);
    expect(out.readability_band).toBe('safe');
    expect(out.readability_score).toBeGreaterThanOrEqual(75);
  });

  it('resume with table structure detected → layout safety penalty applied', () => {
    const withTable = baseResume() + '\n\n| Skill | Level |\n| TS | 5 |\n';
    const out = scoreReadability(withTable, 60);
    expect(out.table_detected).toBe(true);
    expect(out.layout_safety).toBeLessThan(100);
  });

  it('resume with no sections detected → band moderate/high risk', () => {
    const noSections = 'John Doe\njohn@example.com\n(415) 555-1234\nJust some text.\n';
    const out = scoreReadability(noSections, 80);
    expect(out.has_experience_section).toBe(false);
    expect(out.has_skills_section).toBe(false);
    expect(['moderate-risk', 'high-risk']).toContain(out.readability_band);
  });

  it('resume with mixed date formats → moderate/high risk', () => {
    const mixedDates = [
      'John Doe',
      'john@example.com',
      '(415) 555-1234',
      '',
      'Experience',
      '- Built X (01/2022 - 2024-01)',
      '- Shipped Y (Jan 2021 - 2022)',
      '',
      'Skills',
      'TypeScript React',
    ].join('\n');
    const out = scoreReadability(mixedDates, 70);
    expect(out.date_formats_detected).toBeGreaterThanOrEqual(2);
    expect(['moderate-risk', 'high-risk']).toContain(out.readability_band);
  });
});

