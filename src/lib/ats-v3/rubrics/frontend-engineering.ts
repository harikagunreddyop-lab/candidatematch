import { FamilyRubric } from './types';

export const FRONTEND_ENGINEERING_RUBRIC: FamilyRubric = {
  family: 'frontend-engineering',
  version: '3.0.0',
  weights: {
    requirement_coverage: 0.26,
    responsibility_alignment: 0.20,
    domain_relevance: 0.10,
    seniority_fit: 0.10,
    tool_platform_evidence: 0.12,
    recency_weighted_score: 0.10,
    evidence_depth: 0.08,
    impact_scope: 0.04,
  },
  min_critical_must_coverage: 0.70,
  min_total_score_for_pass: 62,
  forbidden_families: [
    'backend-engineering',
    'data-engineering',
    'devops-sre',
    'desktop-support',
  ],
  adjacent_families: [
    'fullstack-engineering',
    'software-engineering',
    'design-ux',
  ],
  domain_required: false,
  regulated_env_required: false,
};


