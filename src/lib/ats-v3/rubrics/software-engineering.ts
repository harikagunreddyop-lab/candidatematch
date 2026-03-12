import { FamilyRubric } from './types';

export const SOFTWARE_ENGINEERING_RUBRIC: FamilyRubric = {
  family: 'software-engineering',
  version: '3.0.0',
  weights: {
    requirement_coverage: 0.28,
    responsibility_alignment: 0.20,
    domain_relevance: 0.12,
    seniority_fit: 0.10,
    tool_platform_evidence: 0.10,
    recency_weighted_score: 0.08,
    evidence_depth: 0.08,
    impact_scope: 0.04,
  },
  min_critical_must_coverage: 0.70,
  min_total_score_for_pass: 62,
  forbidden_families: [
    'desktop-support',
    'data-analyst',
    'design-ux',
    'qa-validation-compliance',
  ],
  adjacent_families: [
    'fullstack-engineering',
    'devops-sre',
    'mobile-engineering',
  ],
  domain_required: false,
  regulated_env_required: false,
};


