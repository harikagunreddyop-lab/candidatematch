import { describe, it, expect } from 'vitest';
import { computePenalties } from '../penalty-engine';
import type {
  CanonicalJobProfile,
  CanonicalResumeProfile,
  RequirementScore,
  RoleFamilyMatch,
  TypedRequirement,
} from '../types';

function makeJob(overrides: Partial<CanonicalJobProfile> = {}): CanonicalJobProfile {
  return {
    job_id: 'job-1',
    title: 'Software Engineer',
    family: 'software-engineering',
    family_confidence: 90,
    seniority: 'mid',
    domain_tags: [],
    industry_vertical: null,
    requirements: [],
    responsibilities: [],
    min_years: null,
    preferred_years: null,
    required_education: null,
    required_certifications: [],
    location_type: null,
    work_auth_required: false,
    raw_description: 'desc',
    extracted_at: new Date().toISOString(),
    model_used: 'x',
    ...overrides,
  };
}

function makeCandidate(overrides: Partial<CanonicalResumeProfile> = {}): CanonicalResumeProfile {
  return {
    candidate_id: 'cand-1',
    resume_id: 'res-1',
    inferred_family: 'software-engineering',
    family_confidence: 90,
    inferred_seniority: 'mid',
    total_years_experience: 3,
    total_roles: 1,
    skill_evidence: new Map(),
    experience: [],
    education: [],
    certifications: [],
    parse_quality: 80,
    parse_warnings: [],
    resume_text:
      'Summary\n\nSkills\nTypeScript React communication collaboration problem solving documentation planning design testing\n',
    ...overrides,
  };
}

function match(match_type: RoleFamilyMatch['match_type']): RoleFamilyMatch {
  return {
    job_family: 'software-engineering',
    candidate_family: 'software-engineering',
    match_type,
    confidence: 80,
    match_explanation: 'test',
  };
}

function req(term: string, cls: TypedRequirement['class']): TypedRequirement {
  return {
    term,
    class: cls,
    normalized: term.toLowerCase(),
    weight: 1,
    section_source: 'requirements',
    frequency_in_jd: 1,
  };
}

function scoreFor(r: TypedRequirement, grade: RequirementScore['grade'], recency: RequirementScore['recency'] = 'undated'): RequirementScore {
  return {
    requirement: r,
    grade,
    grade_value: 0,
    recency,
    recency_multiplier: 0.55,
    effective_credit: grade === 'none' ? 0 : 1,
    matched_by: grade === 'none' ? 'none' : 'exact',
    evidence_snippets: [],
  };
}

describe('computePenalties', () => {
  it('exact family match, no other issues → combined_multiplier = 1.00', () => {
    const job = makeJob();
    const cand = makeCandidate();
    const out = computePenalties(match('exact'), cand, job, []);
    expect(out.combined_multiplier).toBe(1);
  });

  it('adjacent family only → 0.92', () => {
    const job = makeJob();
    const cand = makeCandidate();
    const out = computePenalties(match('adjacent'), cand, job, []);
    expect(out.combined_multiplier).toBeCloseTo(0.92, 2);
  });

  it('mismatch family → 0.68', () => {
    const job = makeJob();
    const cand = makeCandidate();
    const out = computePenalties(match('mismatch'), cand, job, []);
    expect(out.combined_multiplier).toBeCloseTo(0.68, 2);
  });

  it('mismatch + stale evidence → product of 0.68 * 0.92 = ~0.63', () => {
    const job = makeJob({
      requirements: [req('typescript', 'critical_must')],
    });
    const cand = makeCandidate();
    const scores: RequirementScore[] = [
      scoreFor(job.requirements[0], 'contextual', 'stale'),
    ];
    const out = computePenalties(match('mismatch'), cand, job, scores);
    expect(out.combined_multiplier).toBeCloseTo(0.68 * 0.92, 2);
  });

  it('forbidden family → 0.00', () => {
    const job = makeJob();
    const cand = makeCandidate();
    const out = computePenalties(match('forbidden'), cand, job, []);
    expect(out.combined_multiplier).toBe(0);
  });
});

