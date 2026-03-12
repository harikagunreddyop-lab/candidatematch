import { FamilyRubric } from './types';

export const DATA_SCIENCE_RUBRIC: FamilyRubric = {
  family: 'data-science',
  version: '3.0.0',
  weights: {
    requirement_coverage: 0.24,
    responsibility_alignment: 0.18,
    domain_relevance: 0.12,
    seniority_fit: 0.08,
    tool_platform_evidence: 0.12,
    recency_weighted_score: 0.10,
    evidence_depth: 0.10,
    impact_scope: 0.06,
  },
  min_critical_must_coverage: 0.70,
  min_total_score_for_pass: 62,
  forbidden_families: [
    'desktop-support',
    'qa-validation-compliance',
    'design-ux',
  ],
  adjacent_families: ['data-engineering', 'data-analyst', 'software-engineering'],
  domain_required: false,
  regulated_env_required: false,
};


