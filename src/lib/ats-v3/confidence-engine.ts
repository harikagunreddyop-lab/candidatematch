import {
  CanonicalJobProfile,
  CanonicalResumeProfile,
  ConfidenceResult,
  RequirementScore,
  RoleFamilyMatch,
} from './types';

function clip(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function computeConfidence(
  parseQuality: number,
  familyMatch: RoleFamilyMatch,
  requirementScores: RequirementScore[],
  jobProfile: CanonicalJobProfile,
  candidateProfile: CanonicalResumeProfile,
): ConfidenceResult {
  const contributions: string[] = [];

  const parse_quality_contribution = parseQuality * 0.25;
  contributions.push(
    `Parse quality contribution: ${parse_quality_contribution.toFixed(1)}`,
  );

  const family_confidence_contribution = familyMatch.confidence * 0.2;
  contributions.push(
    `Family match confidence contribution: ${family_confidence_contribution.toFixed(
      1,
    )}`,
  );

  const scored = requirementScores.filter((s) => s.grade !== 'none').length;
  const total = requirementScores.length;
  const density = total > 0 ? scored / total : 0;
  const evidence_density_contribution = density * 100 * 0.25;
  contributions.push(
    `Evidence density contribution: ${evidence_density_contribution.toFixed(1)} (density=${density.toFixed(
      2,
    )})`,
  );

  const roles_with_dates = candidateProfile.experience.filter(
    (e) => e.start_date !== null,
  ).length;
  const total_roles = candidateProfile.experience.length;
  const certainty =
    total_roles > 0 ? roles_with_dates / total_roles : 0.5;
  const chronology_contribution = certainty * 100 * 0.15;
  contributions.push(
    `Chronology certainty contribution: ${chronology_contribution.toFixed(
      1,
    )} (certainty=${certainty.toFixed(2)})`,
  );

  const has_requirements =
    jobProfile.requirements.length > 0 ? 100 : 40;
  const jd_contribution = has_requirements * 0.15;
  contributions.push(
    `JD extraction contribution: ${jd_contribution.toFixed(1)} (base=${has_requirements})`,
  );

  let confidence_score = Math.round(
    parse_quality_contribution +
      family_confidence_contribution +
      evidence_density_contribution +
      chronology_contribution +
      jd_contribution,
  );
  confidence_score = clip(confidence_score, 0, 100);

  let confidence_label: ConfidenceResult['confidence_label'];
  let confidence_multiplier: number;

  if (confidence_score >= 75) {
    confidence_label = 'high';
    confidence_multiplier = 1.0;
  } else if (confidence_score >= 55) {
    confidence_label = 'medium';
    confidence_multiplier = 0.92;
  } else {
    confidence_label = 'low';
    confidence_multiplier = 0.8;
  }

  let score_ceiling: number | null = null;
  if (confidence_label === 'low') {
    score_ceiling = 72;
  } else if (confidence_label === 'medium' && parseQuality < 50) {
    score_ceiling = 80;
  } else {
    score_ceiling = null;
  }

  const manual_review_triggered =
    confidence_label === 'low' ||
    (confidence_label === 'medium' &&
      familyMatch.confidence < 60);

  const reasons: string[] = [];
  if (parseQuality < 50) {
    reasons.push('Low parse quality reduces confidence in scoring.');
  }
  if (density < 0.4) {
    reasons.push(
      'Limited evidence coverage across requirements reduces confidence.',
    );
  }
  if (total_roles === 0 || roles_with_dates / Math.max(1, total_roles) < 0.5) {
    reasons.push(
      'Many roles are missing dates, lowering chronology certainty.',
    );
  }
  if (jobProfile.requirements.length === 0) {
    reasons.push(
      'Job description extraction returned no structured requirements.',
    );
  }
  if (manual_review_triggered) {
    reasons.push(
      'Manual review recommended due to overall confidence level.',
    );
  }

  return {
    confidence_score,
    confidence_label,
    confidence_multiplier,
    score_ceiling,
    reasons,
    manual_review_triggered,
  };
}


