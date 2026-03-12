import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CanonicalJobProfile, CanonicalResumeProfile } from '../types';

function makeJob(): CanonicalJobProfile {
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
  };
}

function makeCandidate(): CanonicalResumeProfile {
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
  };
}

describe('computeFinalDecision score formula', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  async function setup({
    gate_passed = true,
    role_fit_score = 80,
    confidence_multiplier = 1.0,
    penalty_multiplier = 1.0,
    score_ceiling = null as number | null,
  } = {}) {
    vi.doMock('../requirement-typer', () => ({
      scoreRequirements: () => [],
    }));

    vi.doMock('../rules/family-taxonomy', () => ({
      getFamilyMatchType: () => 'exact',
    }));

    vi.doMock('../role-family-classifier', () => ({
      classifyJobFamily: () => ({ family: 'software-engineering', confidence: 90 }),
      classifyRoleFamily: () => ({ family: 'software-engineering', confidence: 90 }),
    }));

    vi.doMock('../eligibility-engine', () => ({
      checkEligibility: () => ({
        status: gate_passed ? 'eligible' : 'hard_reject',
        gate_passed,
        reasons: [],
        fatal_blocks: gate_passed ? [] : ['x'],
        review_flags: [],
        missing_fatal: [],
        missing_critical: [],
      }),
    }));

    vi.doMock('../evidence-scorer', () => ({
      scoreRoleFit: () => ({
        requirement_coverage: role_fit_score,
        responsibility_alignment: role_fit_score,
        domain_relevance: role_fit_score,
        seniority_fit: role_fit_score,
        tool_platform_evidence: role_fit_score,
        recency_weighted_score: role_fit_score,
        evidence_depth: role_fit_score,
        impact_scope: role_fit_score,
        role_fit_score,
        requirement_scores: [],
        matched_requirements: [],
        missing_requirements: [],
        family_match: {
          job_family: 'software-engineering',
          candidate_family: 'software-engineering',
          match_type: 'exact',
          confidence: 90,
          match_explanation: 'mock',
        },
        rubric_family: 'software-engineering',
        rubric_weights: {
          requirement_coverage: 1,
          responsibility_alignment: 0,
          domain_relevance: 0,
          seniority_fit: 0,
          tool_platform_evidence: 0,
          recency_weighted_score: 0,
          evidence_depth: 0,
          impact_scope: 0,
        },
      }),
    }));

    vi.doMock('../readability-scorer', () => ({
      scoreReadability: () => ({
        readability_score: 80,
        readability_band: 'safe',
        parse_integrity: 80,
        section_completeness: 100,
        contact_visibility: 100,
        date_consistency: 100,
        layout_safety: 100,
        has_email_in_body: true,
        has_phone_in_body: true,
        has_experience_section: true,
        has_education_section: true,
        has_skills_section: true,
        has_summary_section: true,
        date_formats_detected: 1,
        table_detected: false,
        columns_detected: false,
        header_footer_only_contact: false,
        missing_sections: [],
        warnings: [],
      }),
    }));

    vi.doMock('../penalty-engine', () => ({
      computePenalties: () => ({
        combined_multiplier: penalty_multiplier,
        items: [],
        dominant_penalty: 'none',
      }),
    }));

    vi.doMock('../confidence-engine', () => ({
      computeConfidence: () => ({
        confidence_score: 80,
        confidence_label: confidence_multiplier >= 0.92 ? 'medium' : 'low',
        confidence_multiplier,
        score_ceiling,
        reasons: [],
        manual_review_triggered: false,
      }),
    }));

    const { computeFinalDecision } = await import('../decision-engine');
    return computeFinalDecision;
  }

  it('eligible=true, role_fit=80, confidence_mult=1.0, penalty_mult=1.0 → final ~80', async () => {
    const computeFinalDecision = await setup({
      gate_passed: true,
      role_fit_score: 80,
      confidence_multiplier: 1.0,
      penalty_multiplier: 1.0,
      score_ceiling: null,
    });
    const d = computeFinalDecision(makeJob(), makeCandidate());
    expect(d.final_decision_score).toBe(80);
  });

  it('eligible=false → final = 0', async () => {
    const computeFinalDecision = await setup({
      gate_passed: false,
      role_fit_score: 80,
      confidence_multiplier: 1.0,
      penalty_multiplier: 1.0,
      score_ceiling: null,
    });
    const d = computeFinalDecision(makeJob(), makeCandidate());
    expect(d.final_decision_score).toBe(0);
  });

  it('eligible=true, role_fit=80, confidence_mult=0.80, penalty_mult=0.82 → ~52', async () => {
    const computeFinalDecision = await setup({
      gate_passed: true,
      role_fit_score: 80,
      confidence_multiplier: 0.8,
      penalty_multiplier: 0.82,
      score_ceiling: null,
    });
    const d = computeFinalDecision(makeJob(), makeCandidate());
    expect(d.final_decision_score).toBe(Math.round(80 * 0.8 * 0.82));
  });

  it('score ceiling: low confidence → capped at 72', async () => {
    const computeFinalDecision = await setup({
      gate_passed: true,
      role_fit_score: 95,
      confidence_multiplier: 1.0,
      penalty_multiplier: 1.0,
      score_ceiling: 72,
    });
    const d = computeFinalDecision(makeJob(), makeCandidate());
    expect(d.final_decision_score).toBe(72);
  });
});

