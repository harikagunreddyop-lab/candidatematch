import {
  FinalATSDecision,
  RequirementClass,
  RequirementScore,
} from './types';

type CandidateOutput = {
  scores: { role_fit: number; readability: number; final: number };
  decision: { action: string; summary: string };
  family_match: {
    job_family: string;
    candidate_family: string;
    match_type: string;
    confidence: number;
  };
  confidence: {
    label: string;
    reasons: string[];
  };
  critical_gaps: FinalATSDecision['critical_gaps'];
  top_strengths: string[];
  top_fixes: FinalATSDecision['fix_priorities'];
  adjacent_suggestions: string[];
};

type RequirementEvidenceGroup = {
  class: RequirementClass;
  items: Array<{
    term: string;
    grade: string;
    recency: string;
    effective_credit: number;
  }>;
};

type RecruiterOutput = CandidateOutput & {
  eligibility_detail: {
    status: string;
    fatal_blocks: string[];
    review_flags: string[];
    missing_fatal: string[];
    missing_critical: string[];
  };
  requirement_evidence_map: RequirementEvidenceGroup[];
  penalty_breakdown: ReturnType<
    () => void
  > extends never
    ? never
    : FinalATSDecision['penalty_breakdown'];
  confidence_detail: FinalATSDecision['confidence'];
  readability_warnings: string[];
  role_fit_dimensions: {
    requirement_coverage: number;
    responsibility_alignment: number;
    domain_relevance: number;
    seniority_fit: number;
    tool_platform_evidence: number;
    recency_weighted_score: number;
    evidence_depth: number;
    impact_scope: number;
    weights: Record<string, number>;
  };
  decision_formula: {
    role_fit_score: number;
    eligibility_gate: number;
    confidence_multiplier: number;
    penalty_multiplier: number;
    final_score: number;
  };
};

function groupRequirementsByClass(
  scores: RequirementScore[],
): RequirementEvidenceGroup[] {
  const groups: Record<RequirementClass, RequirementEvidenceGroup> = {
    fatal_must: { class: 'fatal_must', items: [] },
    critical_must: { class: 'critical_must', items: [] },
    standard_must: { class: 'standard_must', items: [] },
    preferred: { class: 'preferred', items: [] },
    bonus: { class: 'bonus', items: [] },
  };

  for (const s of scores) {
    groups[s.requirement.class].items.push({
      term: s.requirement.term,
      grade: s.grade,
      recency: s.recency,
      effective_credit: s.effective_credit,
    });
  }

  return Object.values(groups);
}

export function buildExplanation(decision: FinalATSDecision): {
  candidate_output: CandidateOutput;
  recruiter_output: RecruiterOutput;
} {
  const candidate_output: CandidateOutput = {
    scores: {
      role_fit: decision.role_fit_score,
      readability: decision.readability_score,
      final: decision.final_decision_score,
    },
    decision: {
      action: decision.decision_action,
      summary: decision.decision_summary,
    },
    family_match: {
      job_family: decision.family_match.job_family,
      candidate_family: decision.family_match.candidate_family,
      match_type: decision.family_match.match_type,
      confidence: decision.family_match.confidence,
    },
    confidence: {
      label: decision.confidence.confidence_label,
      reasons: decision.confidence.reasons.slice(0, 2),
    },
    critical_gaps: decision.critical_gaps.slice(0, 5),
    top_strengths: decision.top_strengths.slice(0, 3),
    top_fixes: decision.fix_priorities.slice(0, 5),
    adjacent_suggestions: decision.adjacent_role_suggestions,
  };

  const requirement_evidence_map = groupRequirementsByClass(
    decision.role_fit_breakdown.requirement_scores,
  );

  const recruiter_output: RecruiterOutput = {
    ...candidate_output,
    eligibility_detail: {
      status: decision.eligibility.status,
      fatal_blocks: decision.eligibility.fatal_blocks,
      review_flags: decision.eligibility.review_flags,
      missing_fatal: decision.eligibility.missing_fatal,
      missing_critical: decision.eligibility.missing_critical,
    },
    requirement_evidence_map,
    penalty_breakdown: decision.penalty_breakdown,
    confidence_detail: decision.confidence,
    readability_warnings: decision.readability_breakdown.warnings,
    role_fit_dimensions: {
      requirement_coverage:
        decision.role_fit_breakdown.requirement_coverage,
      responsibility_alignment:
        decision.role_fit_breakdown.responsibility_alignment,
      domain_relevance: decision.role_fit_breakdown.domain_relevance,
      seniority_fit: decision.role_fit_breakdown.seniority_fit,
      tool_platform_evidence:
        decision.role_fit_breakdown.tool_platform_evidence,
      recency_weighted_score:
        decision.role_fit_breakdown.recency_weighted_score,
      evidence_depth: decision.role_fit_breakdown.evidence_depth,
      impact_scope: decision.role_fit_breakdown.impact_scope,
      weights: decision.role_fit_breakdown.rubric_weights,
    },
    decision_formula: {
      role_fit_score: decision.role_fit_score,
      eligibility_gate: decision.eligibility.gate_passed ? 1.0 : 0.0,
      confidence_multiplier: decision.confidence.confidence_multiplier,
      penalty_multiplier:
        decision.penalty_breakdown.combined_multiplier,
      final_score: decision.final_decision_score,
    },
  };

  return { candidate_output, recruiter_output };
}


