import { describe, it, expect } from 'vitest';
import { gradeEvidence } from '../utils/evidence';

describe('gradeEvidence', () => {
  it('zero counts → none', () => {
    expect(
      gradeEvidence({
        exact_count: 0,
        synonym_count: 0,
        in_experience_bullets: false,
        in_skills_section: false,
        in_multiple_jobs: false,
        has_ownership_signal: false,
        has_metric: false,
      }),
    ).toBe('none');
  });

  it('synonym only, not in bullets, not in skills → weak', () => {
    expect(
      gradeEvidence({
        exact_count: 0,
        synonym_count: 1,
        in_experience_bullets: false,
        in_skills_section: false,
        in_multiple_jobs: false,
        has_ownership_signal: false,
        has_metric: false,
      }),
    ).toBe('weak');
  });

  it('in skills section only → listed', () => {
    expect(
      gradeEvidence({
        exact_count: 1,
        synonym_count: 0,
        in_experience_bullets: false,
        in_skills_section: true,
        in_multiple_jobs: false,
        has_ownership_signal: false,
        has_metric: false,
      }),
    ).toBe('listed');
  });

  it('in experience bullets, single job, no ownership → contextual', () => {
    expect(
      gradeEvidence({
        exact_count: 1,
        synonym_count: 0,
        in_experience_bullets: true,
        in_skills_section: false,
        in_multiple_jobs: false,
        has_ownership_signal: false,
        has_metric: false,
      }),
    ).toBe('contextual');
  });

  it('in multiple jobs → repeated', () => {
    expect(
      gradeEvidence({
        exact_count: 1,
        synonym_count: 0,
        in_experience_bullets: true,
        in_skills_section: false,
        in_multiple_jobs: true,
        has_ownership_signal: false,
        has_metric: false,
      }),
    ).toBe('repeated');
  });

  it('ownership + metrics + multiple jobs → owned', () => {
    expect(
      gradeEvidence({
        exact_count: 1,
        synonym_count: 0,
        in_experience_bullets: true,
        in_skills_section: true,
        in_multiple_jobs: true,
        has_ownership_signal: true,
        has_metric: true,
      }),
    ).toBe('owned');
  });
});

