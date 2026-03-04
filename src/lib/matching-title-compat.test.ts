import { describe, it, expect } from 'vitest';
import { isTitleCompatible, _testClassifyDomain } from '@/lib/matching';

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

describe('classifyDomain', () => {
  const classify = _testClassifyDomain;

  it('classifies "QA Analyst" as qa, NOT data-analytics', () => {
    expect(classify('QA Analyst')).toBe('qa');
  });

  it('classifies "QA Analyst - Quality Systems" as qa', () => {
    expect(classify('QA Analyst - Quality Systems')).toBe('qa');
  });

  it('classifies "Quality Assurance Engineer" as qa', () => {
    expect(classify('Quality Assurance Engineer')).toBe('qa');
  });

  it('classifies "Quality Systems Analyst" as qa', () => {
    expect(classify('Quality Systems Analyst')).toBe('qa');
  });

  it('classifies "SDET" as qa', () => {
    expect(classify('SDET')).toBe('qa');
  });

  it('classifies "Security Analyst" as security, NOT data-analytics', () => {
    expect(classify('Security Analyst')).toBe('security');
  });

  it('classifies "Financial Analyst" as finance-analyst', () => {
    expect(classify('Financial Analyst')).toBe('finance-analyst');
  });

  it('classifies "Data Analyst" as data-analytics', () => {
    expect(classify('Data Analyst')).toBe('data-analytics');
  });

  it('classifies "Business Analyst" as data-analytics', () => {
    expect(classify('Business Analyst')).toBe('data-analytics');
  });

  it('classifies "Software Engineer" as software-engineering', () => {
    expect(classify('Software Engineer')).toBe('software-engineering');
  });

  it('classifies "Data Engineer" as data-engineering', () => {
    expect(classify('Data Engineer')).toBe('data-engineering');
  });

  it('classifies "DevOps Engineer" as devops', () => {
    expect(classify('DevOps Engineer')).toBe('devops');
  });

  it('classifies empty string as general', () => {
    expect(classify('')).toBe('general');
  });
});

