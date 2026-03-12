/**
 * ATS Engine V3 — Canonical Type System
 *
 * Philosophy:
 *   - Role Fit and ATS Readability are SEPARATE scores on SEPARATE axes
 *   - Final Decision is an operational action, not just a number
 *   - Confidence degrades score ceilings — uncertainty is surfaced, not hidden
 *   - Every score has an evidence source — no phantom numbers
 *
 * Formula:
 *   FinalDecisionScore = EligibilityGate × RoleFitScore × ConfidenceMultiplier × PenaltyMultiplier
 *   ATSReadabilityScore is reported separately
 */

// ─── Requirement Classes ──────────────────────────────────────────────────────

export type RequirementClass =
  | 'fatal_must'      // missing = hard reject (license, clearance, work auth, on-site mandate)
  | 'critical_must'   // missing = block pass, force review (core tech match, key domain exp)
  | 'standard_must'   // important but not individually fatal (Jira, REST, Docker)
  | 'preferred'       // limited upside only (Master's degree, secondary cert)
  | 'bonus';          // tiny uplift (conference speaking, extra cloud cert)

export interface TypedRequirement {
  term: string;
  class: RequirementClass;
  normalized: string;       // canonical lowercased form
  weight: number;           // 0.0–1.0 within its class
  section_source: 'title' | 'requirements' | 'responsibilities' | 'preferred' | 'inferred';
  frequency_in_jd: number;  // how many times it appeared in the raw JD
}

// ─── Role Family ──────────────────────────────────────────────────────────────

export type RoleFamily =
  | 'software-engineering'
  | 'frontend-engineering'
  | 'backend-engineering'
  | 'fullstack-engineering'
  | 'data-engineering'
  | 'data-science'
  | 'data-analyst'
  | 'business-analyst'
  | 'devops-sre'
  | 'mobile-engineering'
  | 'qa-software'
  | 'qa-validation-compliance'
  | 'security-engineering'
  | 'product-management'
  | 'desktop-support'
  | 'systems-admin'
  | 'management-engineering'
  | 'design-ux'
  | 'general';

export type FamilyMatchType =
  | 'exact'           // same family
  | 'adjacent'        // closely related, transferable
  | 'broad-related'   // same domain, different function
  | 'mismatch'        // low-quality fit
  | 'forbidden';      // should not pass automatically

export interface RoleFamilyMatch {
  job_family: RoleFamily;
  candidate_family: RoleFamily;
  match_type: FamilyMatchType;
  confidence: number;          // 0–100, how certain the classifier is
  match_explanation: string;
}

// ─── Evidence Grades ─────────────────────────────────────────────────────────

export type EvidenceGrade =
  | 'none'          // 0.00 — not found
  | 'weak'          // 0.25 — single shallow mention
  | 'listed'        // 0.50 — skills section only, no context
  | 'contextual'    // 0.70 — appears in experience context
  | 'repeated'      // 0.85 — multiple contextual mentions
  | 'owned';        // 1.00 — direct ownership with outcomes

export const EVIDENCE_GRADE_VALUES: Record<EvidenceGrade, number> = {
  none: 0.00,
  weak: 0.25,
  listed: 0.50,
  contextual: 0.70,
  repeated: 0.85,
  owned: 1.00,
};

export type RecencyBand =
  | 'current'       // 1.00 — within 2 years
  | 'recent'        // 0.85 — 2–4 years
  | 'aging'         // 0.65 — 4–6 years
  | 'stale'         // 0.40 — 6+ years
  | 'undated';      // 0.55 ceiling — no date anchor

export const RECENCY_MULTIPLIERS: Record<RecencyBand, number> = {
  current: 1.00,
  recent: 0.85,
  aging: 0.65,
  stale: 0.40,
  undated: 0.55,
};

// ─── Canonical Profiles ───────────────────────────────────────────────────────

export interface CanonicalSkillEvidence {
  term: string;
  normalized: string;
  grade: EvidenceGrade;
  grade_value: number;
  recency: RecencyBand;
  recency_multiplier: number;
  effective_credit: number;  // grade_value * recency_multiplier
  source_snippets: string[]; // up to 3 resume snippets showing this skill
  last_used_year: number | null;
}

export interface CanonicalExperience {
  title: string;
  company: string;
  start_date: string | null;
  end_date: string | null;
  is_current: boolean;
  duration_months: number;
  bullets: string[];
  skills_mentioned: string[];
  has_metrics: boolean;
  has_ownership_language: boolean;
}

export interface CanonicalResumeProfile {
  candidate_id: string;
  resume_id: string;
  // Classification
  inferred_family: RoleFamily;
  family_confidence: number;
  inferred_seniority: 'intern' | 'junior' | 'mid' | 'senior' | 'staff' | 'principal' | 'lead' | 'manager' | 'director' | null;
  // Totals
  total_years_experience: number;
  total_roles: number;
  // Evidence map
  skill_evidence: Map<string, CanonicalSkillEvidence>;
  // Structured sections
  experience: CanonicalExperience[];
  education: Array<{
    degree: string | null;
    field: string | null;
    institution: string | null;
    graduation_year: number | null;
    is_relevant: boolean;
  }>;
  certifications: string[];
  // Parse quality
  parse_quality: number;  // 0–100
  parse_warnings: string[];
  // Raw text for fallback matching
  resume_text: string;
}

export interface CanonicalJobProfile {
  job_id: string;
  title: string;
  // Classification
  family: RoleFamily;
  family_confidence: number;
  seniority: 'intern' | 'junior' | 'mid' | 'senior' | 'staff' | 'principal' | 'lead' | 'manager' | 'director' | null;
  domain_tags: string[];
  industry_vertical: string | null;
  // Typed requirements
  requirements: TypedRequirement[];
  responsibilities: string[];
  // Constraints
  min_years: number | null;
  preferred_years: number | null;
  required_education: 'high_school' | 'associate' | 'bachelor' | 'master' | 'phd' | null;
  required_certifications: string[];
  location_type: 'remote' | 'hybrid' | 'onsite' | null;
  work_auth_required: boolean;
  // Raw
  raw_description: string;
  extracted_at: string;
  model_used: string;
}

// ─── Engine Outputs ───────────────────────────────────────────────────────────

export type EligibilityStatus =
  | 'eligible'
  | 'eligible_with_review'
  | 'adjacent_only'
  | 'insufficient_data'
  | 'hard_reject';

export interface EligibilityResult {
  status: EligibilityStatus;
  gate_passed: boolean;
  reasons: string[];
  fatal_blocks: string[];       // reasons for hard_reject
  review_flags: string[];       // reasons for eligible_with_review
  missing_fatal: string[];      // fatal_must requirements missing
  missing_critical: string[];   // critical_must requirements missing
}

export interface RequirementScore {
  requirement: TypedRequirement;
  grade: EvidenceGrade;
  grade_value: number;
  recency: RecencyBand;
  recency_multiplier: number;
  effective_credit: number;
  matched_by: 'exact' | 'synonym' | 'partial' | 'none';
  evidence_snippets: string[];
}

export interface RoleFitBreakdown {
  // 0–100 per dimension
  requirement_coverage: number;
  responsibility_alignment: number;
  domain_relevance: number;
  seniority_fit: number;
  tool_platform_evidence: number;
  recency_weighted_score: number;
  evidence_depth: number;
  impact_scope: number;
  // Composite
  role_fit_score: number;   // weighted combination
  // Detail
  requirement_scores: RequirementScore[];
  matched_requirements: string[];
  missing_requirements: string[];
  // Family match used in this scoring
  family_match: RoleFamilyMatch;
  // Rubric used
  rubric_family: RoleFamily;
  rubric_weights: Record<string, number>;
}

export interface ReadabilityBreakdown {
  readability_score: number;    // 0–100
  readability_band: 'safe' | 'moderate-risk' | 'high-risk';
  // Dimensions
  parse_integrity: number;
  section_completeness: number;
  contact_visibility: number;
  date_consistency: number;
  layout_safety: number;
  // Details
  has_email_in_body: boolean;
  has_phone_in_body: boolean;
  has_experience_section: boolean;
  has_education_section: boolean;
  has_skills_section: boolean;
  has_summary_section: boolean;
  date_formats_detected: number;
  table_detected: boolean;
  columns_detected: boolean;
  header_footer_only_contact: boolean;
  missing_sections: string[];
  warnings: string[];
}

export type PenaltySeverity = 'none' | 'mild' | 'moderate' | 'strong' | 'severe' | 'fatal';

export const PENALTY_MULTIPLIERS: Record<PenaltySeverity, number> = {
  none: 1.00,
  mild: 0.92,
  moderate: 0.82,
  strong: 0.68,
  severe: 0.50,
  fatal: 0.00,
};

export interface PenaltyItem {
  type: string;
  severity: PenaltySeverity;
  multiplier: number;
  detail: string;
}

export interface PenaltyBreakdown {
  combined_multiplier: number;   // product of all applied multipliers
  items: PenaltyItem[];
  dominant_penalty: PenaltySeverity;
}

export interface ConfidenceResult {
  confidence_score: number;     // 0–100
  confidence_label: 'high' | 'medium' | 'low';
  confidence_multiplier: number; // 1.00 / 0.92 / 0.80 / 0.65
  score_ceiling: number | null; // null = no cap, number = max allowed final score
  reasons: string[];
  manual_review_triggered: boolean;
}

export type DecisionAction =
  | 'eligible_pass'
  | 'eligible_review'
  | 'tailor_before_apply'
  | 'adjacent_role_recommendation'
  | 'hard_reject'
  | 'insufficient_data';

export interface FinalATSDecision {
  // Scores
  role_fit_score: number;
  readability_score: number;
  final_decision_score: number;       // = EligibilityGate × RoleFit × Confidence × Penalty
  // Meta
  confidence: ConfidenceResult;
  eligibility: EligibilityResult;
  family_match: RoleFamilyMatch;
  // Action
  decision_action: DecisionAction;
  decision_summary: string;
  decision_version: string;           // semver of scoring logic, e.g. "3.0.0"
  // Bands
  role_fit_band: 'elite' | 'strong' | 'possible' | 'weak';
  readability_band: 'safe' | 'moderate-risk' | 'high-risk';
  // Breakdowns
  role_fit_breakdown: RoleFitBreakdown;
  readability_breakdown: ReadabilityBreakdown;
  penalty_breakdown: PenaltyBreakdown;
  // Actionable output
  critical_gaps: Array<{
    class: RequirementClass;
    term: string;
    impact: 'critical' | 'high' | 'medium' | 'low';
    suggestion: string;
  }>;
  top_strengths: string[];
  fix_priorities: Array<{
    rank: number;
    impact: 'critical' | 'high' | 'medium' | 'low';
    issue: string;
    action: string;
    affects: string[];
    score_delta_estimate: number;
  }>;
  adjacent_role_suggestions: string[];
  // Audit
  scored_at: string;
}

// ─── Rubric Interface ─────────────────────────────────────────────────────────

export interface FamilyRubric {
  family: RoleFamily;
  version: string;
  // Dimension weights — must sum to 1.0
  weights: {
    requirement_coverage: number;
    responsibility_alignment: number;
    domain_relevance: number;
    seniority_fit: number;
    tool_platform_evidence: number;
    recency_weighted_score: number;
    evidence_depth: number;
    impact_scope: number;
  };
  // Gating thresholds
  min_critical_must_coverage: number;  // 0.0–1.0, e.g. 0.70 means need 70% of critical_musts
  min_total_score_for_pass: number;    // e.g. 65
  // Eligibility rules
  forbidden_families: RoleFamily[];
  adjacent_families: RoleFamily[];
  // Penalty triggers specific to this family
  domain_required: boolean;           // if true, domain mismatch triggers strong penalty
  regulated_env_required: boolean;    // if true, missing regulated exp triggers penalty
}
