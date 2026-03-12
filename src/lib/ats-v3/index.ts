export { normalizeJob } from './job-normalizer';
export { normalizeCandidate } from './candidate-normalizer';
export { computeFinalDecision } from './decision-engine';
export { buildExplanation } from './explainer';
export type {
  FinalATSDecision,
  CanonicalJobProfile,
  CanonicalResumeProfile,
  RoleFamilyMatch,
  EligibilityResult,
  RoleFitBreakdown,
  ReadabilityBreakdown,
  PenaltyBreakdown,
  ConfidenceResult,
  DecisionAction,
  RequirementScore,
  TypedRequirement,
} from './types';

