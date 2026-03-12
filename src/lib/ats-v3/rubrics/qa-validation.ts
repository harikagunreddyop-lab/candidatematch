import { FamilyRubric } from './types';

export const QA_VALIDATION_RUBRIC: FamilyRubric = {
  family: 'qa-validation-compliance',
  version: '3.0.0',
  weights: {
    requirement_coverage: 0.24,
    responsibility_alignment: 0.22,
    domain_relevance: 0.14,
    seniority_fit: 0.08,
    tool_platform_evidence: 0.08,
    recency_weighted_score: 0.10,
    evidence_depth: 0.08,
    impact_scope: 0.06,
  },
  min_critical_must_coverage: 0.75,
  min_total_score_for_pass: 62,
  forbidden_families: [
    'software-engineering',
    'frontend-engineering',
    'data-engineering',
    'desktop-support',
    'design-ux',
  ],
  adjacent_families: ['qa-software'],
  domain_required: true,
  regulated_env_required: true,
};


