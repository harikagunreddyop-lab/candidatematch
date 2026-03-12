import { FamilyRubric } from './types';

export const PRODUCT_MANAGER_RUBRIC: FamilyRubric = {
  family: 'product-management',
  version: '3.0.0',
  weights: {
    requirement_coverage: 0.20,
    responsibility_alignment: 0.22,
    domain_relevance: 0.14,
    seniority_fit: 0.10,
    tool_platform_evidence: 0.08,
    recency_weighted_score: 0.08,
    evidence_depth: 0.08,
    impact_scope: 0.10,
  },
  min_critical_must_coverage: 0.65,
  min_total_score_for_pass: 60,
  forbidden_families: ['desktop-support', 'qa-validation-compliance'],
  adjacent_families: ['business-analyst', 'design-ux'],
  domain_required: false,
  regulated_env_required: false,
};


