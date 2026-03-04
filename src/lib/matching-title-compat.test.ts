import { describe, it, expect } from 'vitest';
import { isTitleCompatible, _testClassifyDomain, _testIsTitleMatch } from '@/lib/matching';

const baseCandidate = {
  id: 'cand-1',
  full_name: 'Test Candidate',
  primary_title: undefined as string | undefined,
  secondary_titles: [] as string[],
  target_job_titles: [] as string[],
  active: true,
} as any;

const baseJob = {
  id: 'job-1',
  title: '',
  company: 'Acme',
} as any;

// ── isTitleCompatible ────────────────────────────────────────────────────────

describe('isTitleCompatible', () => {
  it('allows QA candidate for QA job', () => {
    const candidate = { ...baseCandidate, primary_title: 'QA Analyst', target_job_titles: ['Quality Assurance Engineer'] };
    const job = { ...baseJob, title: 'Senior QA Engineer' };
    expect(isTitleCompatible(candidate, job)).toBe(true);
  });

  it('blocks QA candidate for non-QA analyst job', () => {
    const candidate = { ...baseCandidate, primary_title: 'QA Analyst', target_job_titles: ['Quality Assurance Engineer'] };
    const job = { ...baseJob, title: 'Compliance Analyst' };
    expect(isTitleCompatible(candidate, job)).toBe(false);
  });

  it('blocks Data Analyst candidate for Financial Analyst job', () => {
    const candidate = { ...baseCandidate, primary_title: 'Data Analyst', target_job_titles: ['Business Data Analyst'] };
    const job = { ...baseJob, title: 'Senior Financial Analyst' };
    expect(isTitleCompatible(candidate, job)).toBe(false);
  });

  it('allows generic candidate with no titles (no gating)', () => {
    const candidate = { ...baseCandidate, primary_title: '', secondary_titles: [], target_job_titles: [] };
    const job = { ...baseJob, title: 'Operations Analyst' };
    expect(isTitleCompatible(candidate, job)).toBe(true);
  });

  it('blocks QA candidate from Software Developer job (domain mismatch)', () => {
    const candidate = { ...baseCandidate, primary_title: 'QA Analyst' };
    const job = { ...baseJob, title: 'Software Developer' };
    expect(isTitleCompatible(candidate, job)).toBe(false);
  });

  it('allows Product Manager for Product Owner job', () => {
    const candidate = { ...baseCandidate, primary_title: 'Product Manager' };
    const job = { ...baseJob, title: 'Product Owner' };
    expect(isTitleCompatible(candidate, job)).toBe(true);
  });
});

// ── isTitleMatch ─────────────────────────────────────────────────────────────

describe('isTitleMatch', () => {
  const titleMatch = _testIsTitleMatch;

  it('matches same-domain titles: QA Analyst → QA Engineer', () => {
    const candidate = { ...baseCandidate, primary_title: 'QA Analyst', target_job_titles: ['QA Analyst'] };
    const job = { ...baseJob, title: 'QA Engineer' };
    expect(titleMatch(candidate, job)).toBe(true);
  });

  it('matches via secondary_titles: past Test Engineer matches Test Automation job', () => {
    const candidate = { ...baseCandidate, primary_title: 'QA Lead', secondary_titles: ['Test Engineer'], target_job_titles: [] };
    const job = { ...baseJob, title: 'Test Automation Engineer' };
    expect(titleMatch(candidate, job)).toBe(true);
  });

  it('does NOT match QA candidate to Software Developer job', () => {
    const candidate = { ...baseCandidate, primary_title: 'QA Analyst', target_job_titles: ['QA Analyst'] };
    const job = { ...baseJob, title: 'Software Developer' };
    expect(titleMatch(candidate, job)).toBe(false);
  });

  it('matches same-domain: Data Engineer → Senior Data Engineer', () => {
    const candidate = { ...baseCandidate, primary_title: 'Data Engineer' };
    const job = { ...baseJob, title: 'Senior Data Engineer' };
    expect(titleMatch(candidate, job)).toBe(true);
  });

  it('does NOT match Data Engineer → Data Analyst (different domains)', () => {
    const candidate = { ...baseCandidate, primary_title: 'Data Engineer' };
    const job = { ...baseJob, title: 'Data Analyst' };
    expect(titleMatch(candidate, job)).toBe(false);
  });

  it('matches with shared non-trivial token across compatible domains: React Developer → Frontend React Engineer', () => {
    const candidate = { ...baseCandidate, primary_title: 'React Developer' };
    const job = { ...baseJob, title: 'Frontend React Engineer' };
    expect(titleMatch(candidate, job)).toBe(true);
  });

  it('does NOT match when no titles at all', () => {
    const candidate = { ...baseCandidate, primary_title: '', secondary_titles: [], target_job_titles: [] };
    const job = { ...baseJob, title: 'Any Job' };
    expect(titleMatch(candidate, job)).toBe(false);
  });

  it('matches fullstack candidate to frontend job when they share a non-trivial token', () => {
    const candidate = { ...baseCandidate, primary_title: 'Full-Stack React Developer' };
    const job = { ...baseJob, title: 'Frontend React Engineer' };
    expect(titleMatch(candidate, job)).toBe(true);
  });

  it('does NOT match fullstack → frontend without shared non-trivial token', () => {
    const candidate = { ...baseCandidate, primary_title: 'Full-Stack Developer' };
    const job = { ...baseJob, title: 'Frontend Developer' };
    expect(titleMatch(candidate, job)).toBe(false);
  });

  it('does NOT match Security Analyst to DevOps Engineer (tightened domains)', () => {
    const candidate = { ...baseCandidate, primary_title: 'Security Analyst' };
    const job = { ...baseJob, title: 'DevOps Engineer' };
    expect(titleMatch(candidate, job)).toBe(false);
  });
});

// ── classifyDomain ───────────────────────────────────────────────────────────

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

  it('classifies "Product Manager" as management', () => {
    expect(classify('Product Manager')).toBe('management');
  });

  it('classifies "Product Owner" as product', () => {
    expect(classify('Product Owner')).toBe('product');
  });

  it('classifies empty string as general', () => {
    expect(classify('')).toBe('general');
  });
});

