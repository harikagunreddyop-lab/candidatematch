import { FamilyRubric } from './types';

export const DESKTOP_SUPPORT_RUBRIC: FamilyRubric = {
  family: 'desktop-support',
  version: '3.0.0',
  weights: {
    requirement_coverage: 0.24,
    responsibility_alignment: 0.22,
    domain_relevance: 0.10,
    seniority_fit: 0.08,
    tool_platform_evidence: 0.16,
    recency_weighted_score: 0.10,
    evidence_depth: 0.06,
    impact_scope: 0.04,
  },
  min_critical_must_coverage: 0.60,
  min_total_score_for_pass: 60,
  forbidden_families: [
    'software-engineering',
    'data-engineering',
    'data-science',
    'qa-validation-compliance',
    'product-management',
  ],
  adjacent_families: ['systems-admin'],
  domain_required: false,
  regulated_env_required: false,
};


