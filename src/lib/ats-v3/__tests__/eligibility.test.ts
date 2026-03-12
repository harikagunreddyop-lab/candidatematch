import { describe, it, expect } from 'vitest';
import { checkEligibility } from '../eligibility-engine';
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
    resume_text: 'resume',
    ...overrides,
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

function scoreFor(r: TypedRequirement, grade: RequirementScore['grade'], effective_credit = 1): RequirementScore {
  return {
    requirement: r,
    grade,
    grade_value: 0,
    recency: 'undated',
    recency_multiplier: 0.55,
    effective_credit,
    matched_by: grade === 'none' ? 'none' : 'exact',
    evidence_snippets: [],
  };
}

function match(
  match_type: RoleFamilyMatch['match_type'],
  job_family: RoleFamilyMatch['job_family'] = 'software-engineering',
  candidate_family: RoleFamilyMatch['candidate_family'] = 'software-engineering',
): RoleFamilyMatch {
  return {
    job_family,
    candidate_family,
    match_type,
    confidence: 80,
    match_explanation: 'test',
  };
}

describe('checkEligibility', () => {
  it('candidate with zero experience → insufficient_data', () => {
    const job = makeJob();
    const candidate = makeCandidate({
      total_years_experience: 0,
      experience: [],
    });
    const res = checkEligibility(job, candidate, [], match('exact'));
    expect(res.status).toBe('insufficient_data');
    expect(res.gate_passed).toBe(false);
  });

  it('forbidden family (backend applying to QA validation) → hard_reject', () => {
    const job = makeJob({ family: 'qa-validation-compliance' });
    const candidate = makeCandidate({ inferred_family: 'backend-engineering' });
    const res = checkEligibility(job, candidate, [], match('forbidden', 'qa-validation-compliance', 'backend-engineering'));
    expect(res.status).toBe('hard_reject');
    expect(res.gate_passed).toBe(false);
  });

  it('missing fatal_must requirement → hard_reject', () => {
    const job = makeJob({
      requirements: [req('US work authorization', 'fatal_must')],
    });
    const candidate = makeCandidate();
    const scores = [scoreFor(job.requirements[0], 'none', 0)];
    const res = checkEligibility(job, candidate, scores, match('exact'));
    expect(res.status).toBe('hard_reject');
    expect(res.missing_fatal).toContain('US work authorization');
  });

  it('all fatal and critical met, exact family → eligible', () => {
    const job = makeJob({
      requirements: [req('work authorization', 'fatal_must'), req('typescript', 'critical_must')],
      seniority: 'mid',
    });
    const candidate = makeCandidate({
      inferred_seniority: 'mid',
      experience: [{ title: 'Dev', company: 'X', start_date: null, end_date: null, is_current: false, duration_months: 12, bullets: [], skills_mentioned: [], has_metrics: false, has_ownership_language: true }],
    });
    const scores = [
      scoreFor(job.requirements[0], 'contextual', 1),
      scoreFor(job.requirements[1], 'contextual', 1),
    ];
    const res = checkEligibility(job, candidate, scores, match('exact'));
    expect(res.status).toBe('eligible');
    expect(res.gate_passed).toBe(true);
  });

  it('missing 1 critical_must, otherwise fine → eligible_with_review', () => {
    const job = makeJob({
      requirements: [req('typescript', 'critical_must'), req('react', 'critical_must')],
    });
    const candidate = makeCandidate();
    const scores = [
      scoreFor(job.requirements[0], 'contextual', 0.9),
      scoreFor(job.requirements[1], 'none', 0.0),
    ];
    const res = checkEligibility(job, candidate, scores, match('exact'));
    expect(res.status).toBe('eligible_with_review');
    expect(res.gate_passed).toBe(true);
  });

  it('adjacent family, otherwise fine → eligible_with_review', () => {
    const job = makeJob({ family: 'software-engineering' });
    const candidate = makeCandidate({ inferred_family: 'fullstack-engineering' });
    const critical = req('typescript', 'critical_must');
    const res = checkEligibility(
      { ...job, requirements: [critical] },
      candidate,
      [scoreFor(critical, 'contextual', 1)],
      match('adjacent', 'software-engineering', 'fullstack-engineering'),
    );
    expect(res.status).toBe('eligible_with_review');
    expect(res.gate_passed).toBe(true);
  });
});

