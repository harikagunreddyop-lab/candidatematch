/**
 * ATS Engine v3 — Unified type definitions
 *
 * Research basis:
 * - Taleo: exact keyword matching, req rank from frequency + structured fields
 * - iCIMS: keyword frequency ranking, similarity % score
 * - Workday: NLP field matching, no auto-score, knockout-driven
 * - Greenhouse: semantic matching, no auto-score, human scorecards
 * - Lever: semantic + some tense recognition, boolean search
 * - SmartRecruiters: exact match, 0-100 fit score from experience+education+skills
 *
 * A score of 80+ means the resume passes Taleo (strictest) on formatting
 * AND has ≥75% keyword coverage — passing every other system by definition.
 */

export interface JobRequirements {
  // Required skills — must appear verbatim or via tracked synonym
  must_have_skills: string[];
  // Preferred skills — bonus credit
  nice_to_have_skills: string[];
  // Skills implied by role but not stated (e.g. "Senior React Dev" implies JS, HTML, CSS)
  implicit_skills: string[];
  // Years range
  min_years_experience: number | null;
  preferred_years_experience: number | null;
  // Seniority from title + years
  seniority_level: 'intern' | 'junior' | 'mid' | 'senior' | 'staff' | 'principal' | 'lead' | 'manager' | 'director' | null;
  // Education gate
  required_education: 'high_school' | 'associate' | 'bachelor' | 'master' | 'phd' | null;
  // Certifications
  certifications: string[];
  // Role domain for title-match logic
  domain: string;
  // Core duties (3-5 bullets) — used for responsibility alignment
  responsibilities: string[];
  // Raw keywords from JD with frequency weight
  weighted_keywords: Array<{ term: string; weight: number; section: 'title' | 'requirements' | 'responsibilities' | 'preferred' }>;
}

export interface ResumeCandidate {
  // Parsed structured data
  skills: string[];
  tools: string[];
  primary_title: string | null;
  secondary_titles: string[];
  years_of_experience: number | null;
  experience: Array<{
    title: string;
    company: string;
    start_date: string | null;
    end_date: string | null;
    current: boolean;
    bullets: string[];
  }>;
  education: Array<{
    degree: string | null;
    field: string | null;
    institution: string | null;
    graduation_year: number | null;
  }>;
  certifications: string[];
  location: string | null;
  // Full raw text — used for keyword scanning
  resume_text: string;
}

// Dimension-level result
export interface DimensionResult {
  score: number;        // 0-100 for this dimension
  max: number;          // always 100
  weight: number;       // contribution weight
  contribution: number; // score * weight
  label: string;
  details: string;
  matched?: string[];
  missing?: string[];
  warnings?: string[];
}

// Keyword coverage detail
export interface KeywordCoverageResult {
  total_jd_keywords: number;
  matched_exact: string[];
  matched_synonym: string[];
  matched_implicit: string[];
  missing_must_have: string[];
  missing_nice_to_have: string[];
  coverage_rate: number;         // 0-1
  density_score: number;         // keyword density quality 0-100
  placement_score: number;       // keyword in experience bullets vs only skills list 0-100
}

// Parse integrity detail
export interface ParseIntegrityResult {
  score: number;             // 0-100
  has_contact_in_body: boolean;
  has_standard_headers: boolean;
  date_format_consistent: boolean;
  no_tables_detected: boolean;
  no_columns_detected: boolean;
  no_header_footer_content: boolean;
  has_email: boolean;
  has_phone: boolean;
  parseable_sections: string[];
  missing_sections: string[];
  warnings: string[];
}

// Final score output
export interface ATSScoreResult {
  // The number. 80+ = passes any ATS. 65-79 = passes modern ATS. <65 = likely filtered.
  total_score: number;
  // Calibrated band
  band: 'elite' | 'strong' | 'needs-work' | 'failing';
  // Confidence in score (0-1) — low if resume text is sparse
  confidence: number;
  // Gate — if false, must-haves are too low regardless of total score
  hard_gate_passed: boolean;
  hard_gate_reason: string;
  // Per-dimension breakdown
  dimensions: {
    keyword_coverage: DimensionResult;
    parse_integrity: DimensionResult;
    experience_match: DimensionResult;
    section_completeness: DimensionResult;
    keyword_placement: DimensionResult;
    formatting_details: DimensionResult;
  };
  // Detailed keyword analysis
  keyword_analysis: KeywordCoverageResult;
  // Detailed parse analysis
  parse_analysis: ParseIntegrityResult;
  // Ordered list of fixes, highest impact first
  fix_priorities: Array<{
    rank: number;
    impact: 'critical' | 'high' | 'medium' | 'low';
    issue: string;
    fix: string;
    affects_systems: string[];  // which ATS this fix addresses
    score_delta_estimate: number; // approximate score gain
  }>;
  // ATS-system specific verdicts
  system_verdicts: {
    taleo: { passes: boolean; reason: string };
    workday: { passes: boolean; reason: string };
    icims: { passes: boolean; reason: string };
    greenhouse: { passes: boolean; reason: string };
    lever: { passes: boolean; reason: string };
    smartrecruiters: { passes: boolean; reason: string };
  };
}

