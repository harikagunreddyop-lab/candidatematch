import { FamilyRubric } from './types';

export const DATA_ENGINEERING_RUBRIC: FamilyRubric = {
  family: 'data-engineering',
  version: '3.0.0',
  weights: {
    requirement_coverage: 0.26,
    responsibility_alignment: 0.20,
    domain_relevance: 0.10,
    seniority_fit: 0.08,
    tool_platform_evidence: 0.12,
    recency_weighted_score: 0.10,
    evidence_depth: 0.08,
    impact_scope: 0.06,
  },
  min_critical_must_coverage: 0.70,
  min_total_score_for_pass: 62,
  forbidden_families: [
    'frontend-engineering',
    'desktop-support',
    'design-ux',
    'qa-validation-compliance',
  ],
  adjacent_families: ['data-science', 'software-engineering', 'devops-sre'],
  domain_required: false,
  regulated_env_required: false,
};


