import { FamilyRubric } from './types';

export const DATA_ANALYST_RUBRIC: FamilyRubric = {
  family: 'data-analyst',
  version: '3.0.0',
  weights: {
    requirement_coverage: 0.22,
    responsibility_alignment: 0.20,
    domain_relevance: 0.12,
    seniority_fit: 0.08,
    tool_platform_evidence: 0.12,
    recency_weighted_score: 0.10,
    evidence_depth: 0.08,
    impact_scope: 0.08,
  },
  min_critical_must_coverage: 0.65,
  min_total_score_for_pass: 60,
  forbidden_families: [
    'software-engineering',
    'desktop-support',
    'qa-validation-compliance',
    'devops-sre',
  ],
  adjacent_families: ['data-science', 'data-engineering', 'business-analyst'],
  domain_required: false,
  regulated_env_required: false,
};


