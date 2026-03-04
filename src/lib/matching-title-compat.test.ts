import { describe, it, expect } from 'vitest';
import { isTitleCompatible } from '@/lib/matching';

describe('isTitleCompatible', () => {
  const baseCandidate = {
    id: 'cand-1',
    full_name: 'Test Candidate',
    primary_title: undefined,
    secondary_titles: [] as string[],
    target_job_titles: [] as string[],
    active: true,
  } as any;

  const baseJob = {
    id: 'job-1',
    title: '',
    company: 'Acme',
  } as any;

  it('allows QA candidate for QA job', () => {
    const candidate = {
      ...baseCandidate,
      primary_title: 'QA Analyst',
      target_job_titles: ['Quality Assurance Engineer'],
    };
    const job = {
      ...baseJob,
      title: 'Senior QA Engineer',
    };
    expect(isTitleCompatible(candidate, job)).toBe(true);
  });

  it('blocks QA candidate for non-QA analyst job', () => {
    const candidate = {
      ...baseCandidate,
      primary_title: 'QA Analyst',
      target_job_titles: ['Quality Assurance Engineer'],
    };
    const job = {
      ...baseJob,
      title: 'Compliance Analyst',
    };
    expect(isTitleCompatible(candidate, job)).toBe(false);
  });

  it('blocks Data Analyst candidate for Financial Analyst job', () => {
    const candidate = {
      ...baseCandidate,
      primary_title: 'Data Analyst',
      target_job_titles: ['Business Data Analyst'],
    };
    const job = {
      ...baseJob,
      title: 'Senior Financial Analyst',
    };
    expect(isTitleCompatible(candidate, job)).toBe(false);
  });

  it('allows generic candidate with no titles (no gating)', () => {
    const candidate = {
      ...baseCandidate,
      primary_title: '',
      secondary_titles: [],
      target_job_titles: [],
    };
    const job = {
      ...baseJob,
      title: 'Operations Analyst',
    };
    expect(isTitleCompatible(candidate, job)).toBe(true);
  });
});

