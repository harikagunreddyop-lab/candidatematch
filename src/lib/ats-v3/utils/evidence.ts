import { EvidenceGrade, EVIDENCE_GRADE_VALUES } from '../types';

interface GradeParams {
  exact_count: number;
  synonym_count: number;
  in_experience_bullets: boolean;
  in_skills_section: boolean;
  in_multiple_jobs: boolean;
  has_ownership_signal: boolean;
  has_metric: boolean;
}

export function gradeEvidence(params: GradeParams): EvidenceGrade {
  const {
    exact_count,
    synonym_count,
    in_experience_bullets,
    in_skills_section,
    in_multiple_jobs,
    has_ownership_signal,
    has_metric,
  } = params;

  const anyMention = exact_count > 0 || synonym_count > 0;

  if (!anyMention) {
    return 'none';
  }

  // Weak mention: present somewhere but not in skills or experience bullets
  if (!in_experience_bullets && !in_skills_section) {
    return 'weak';
  }

  // Listed only in skills
  if (in_skills_section && !in_experience_bullets) {
    return 'listed';
  }

  // Strongest signal: ownership + metrics across multiple jobs
  if (has_ownership_signal && has_metric && in_multiple_jobs) {
    return 'owned';
  }

  // Contextual but limited
  if (in_experience_bullets && !in_multiple_jobs && !has_ownership_signal) {
    return 'contextual';
  }

  // Repeated or strong contextual evidence
  if (
    in_multiple_jobs ||
    (in_experience_bullets && (has_ownership_signal || has_metric))
  ) {
    return 'repeated';
  }

  // Fallback
  return 'contextual';
}

export function computeEffectiveCredit(
  grade: EvidenceGrade,
  recencyMultiplier: number,
): number {
  const base = EVIDENCE_GRADE_VALUES[grade] ?? 0;
  const value = base * recencyMultiplier;
  return Math.round(value * 1000) / 1000;
}


