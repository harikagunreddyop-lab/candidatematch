import { FamilyRubric } from './types';

export const DEVOPS_SRE_RUBRIC: FamilyRubric = {
  family: 'devops-sre',
  version: '3.0.0',
  weights: {
    requirement_coverage: 0.26,
    responsibility_alignment: 0.20,
    domain_relevance: 0.10,
    seniority_fit: 0.08,
    tool_platform_evidence: 0.14,
    recency_weighted_score: 0.10,
    evidence_depth: 0.08,
    impact_scope: 0.04,
  },
  min_critical_must_coverage: 0.70,
  min_total_score_for_pass: 62,
  forbidden_families: [
    'desktop-support',
    'design-ux',
    'qa-validation-compliance',
  ],
  adjacent_families: [
    'software-engineering',
    'backend-engineering',
    'data-engineering',
    'systems-admin',
  ],
  domain_required: false,
  regulated_env_required: false,
};


