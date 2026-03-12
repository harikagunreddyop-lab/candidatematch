import {
  CanonicalJobProfile,
  CanonicalResumeProfile,
  DecisionAction,
  FinalATSDecision,
  RequirementScore,
  RoleFamilyMatch,
} from './types';
import { scoreRequirements } from './requirement-typer';
import { classifyRoleFamily, classifyJobFamily } from './role-family-classifier';
import { getFamilyMatchType } from './rules/family-taxonomy';
import { checkEligibility } from './eligibility-engine';
import { scoreRoleFit } from './evidence-scorer';
import { scoreReadability } from './readability-scorer';
import { computePenalties } from './penalty-engine';
import { computeConfidence } from './confidence-engine';

function clip(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function buildCriticalGaps(
  requirementScores: RequirementScore[],
): FinalATSDecision['critical_gaps'] {
  const gaps: FinalATSDecision['critical_gaps'] = [];

  for (const s of requirementScores) {
    if (s.grade === 'none' || s.effective_credit < 0.35) {
      let impact: 'critical' | 'high' | 'medium' | 'low' = 'low';
      if (s.requirement.class === 'fatal_must') impact = 'critical';
      else if (s.requirement.class === 'critical_must') impact = 'high';
      else if (s.requirement.class === 'standard_must') impact = 'medium';

      gaps.push({
        class: s.requirement.class,
        term: s.requirement.term,
        impact,
        suggestion: `Add '${s.requirement.term}' to experience bullets with specific context showing how you used it.`,
      });
    }
  }

  return gaps;
}

export function computeFinalDecision(
  jobProfile: CanonicalJobProfile,
  candidateProfile: CanonicalResumeProfile,
): FinalATSDecision {
  // 1. Score requirements
  const requirementScores = scoreRequirements(jobProfile, candidateProfile);

  // 2. Classify families
  const jobFamily = jobProfile.family;
  const candFamily = candidateProfile.inferred_family;

  const jobFamilyClassification = classifyJobFamily(
    jobProfile.title,
    jobProfile.raw_description,
  );
  const candidateFamilyClassification = classifyRoleFamily(
    [candidateProfile.experience[0]?.title || ''],
    candidateProfile.resume_text,
  );

  const matchType = getFamilyMatchType(jobFamily, candFamily);
  const familyMatch: RoleFamilyMatch = {
    job_family: jobFamily,
    candidate_family: candFamily,
    match_type: matchType,
    confidence: Math.round(
      (jobFamilyClassification.confidence +
        candidateFamilyClassification.confidence) /
        2,
    ),
    match_explanation: 'Determined by ATS Engine V3 family taxonomy.',
  };

  // 3. Check eligibility
  const eligibility = checkEligibility(
    jobProfile,
    candidateProfile,
    requirementScores,
    familyMatch,
  );

  // 4. Score role fit
  const role_fit_breakdown = scoreRoleFit(
    jobProfile,
    candidateProfile,
    requirementScores,
    familyMatch,
  );

  // 5. Score readability
  const readability_breakdown = scoreReadability(
    candidateProfile.resume_text,
    candidateProfile.parse_quality,
  );

  // 6. Compute penalties
  const penalty_breakdown = computePenalties(
    familyMatch,
    candidateProfile,
    jobProfile,
    requirementScores,
  );

  // 7. Compute confidence
  const confidence = computeConfidence(
    candidateProfile.parse_quality,
    familyMatch,
    requirementScores,
    jobProfile,
    candidateProfile,
  );

  // FINAL DECISION SCORE
  const eligibilityGate = eligibility.gate_passed ? 1.0 : 0.0;
  let finalScore =
    role_fit_breakdown.role_fit_score *
    eligibilityGate *
    confidence.confidence_multiplier *
    penalty_breakdown.combined_multiplier;

  if (confidence.score_ceiling !== null) {
    finalScore = Math.min(finalScore, confidence.score_ceiling);
  }
  finalScore = Math.round(clip(finalScore, 0, 100));

  // DECISION ACTION
  let decision_action: DecisionAction;

  if (!eligibility.gate_passed) {
    decision_action =
      eligibility.status === 'insufficient_data'
        ? 'insufficient_data'
        : 'hard_reject';
  } else if (
    finalScore >= 75 &&
    readability_breakdown.readability_band !== 'high-risk'
  ) {
    decision_action = 'eligible_pass';
  } else if (finalScore >= 65) {
    decision_action = 'eligible_review';
  } else if (
    readability_breakdown.readability_band === 'high-risk' &&
    finalScore >= 55
  ) {
    decision_action = 'tailor_before_apply';
  } else if (
    familyMatch.match_type === 'adjacent' &&
    finalScore >= 50
  ) {
    decision_action = 'adjacent_role_recommendation';
  } else {
    decision_action =
      finalScore >= 40 ? 'tailor_before_apply' : 'hard_reject';
  }

  // ROLE FIT BAND
  let role_fit_band: FinalATSDecision['role_fit_band'];
  if (role_fit_breakdown.role_fit_score >= 85) {
    role_fit_band = 'elite';
  } else if (role_fit_breakdown.role_fit_score >= 70) {
    role_fit_band = 'strong';
  } else if (role_fit_breakdown.role_fit_score >= 55) {
    role_fit_band = 'possible';
  } else {
    role_fit_band = 'weak';
  }

  const top_strengths: string[] =
    role_fit_breakdown.matched_requirements.slice(0, 5);

  const critical_gaps = buildCriticalGaps(requirementScores);

  const fix_priorities: FinalATSDecision['fix_priorities'] = critical_gaps
    .map((gap, index) => ({
      rank: index + 1,
      impact: gap.impact,
      issue: `Missing or weak evidence for '${gap.term}'`,
      action: gap.suggestion,
      affects: ['role_fit_score'],
      score_delta_estimate:
        gap.impact === 'critical'
          ? 15
          : gap.impact === 'high'
          ? 10
          : gap.impact === 'medium'
          ? 6
          : 3,
    }))
    .sort((a, b) => b.score_delta_estimate - a.score_delta_estimate)
    .slice(0, 10);

  const adjacent_role_suggestions: string[] =
    familyMatch.match_type === 'adjacent'
      ? [`Consider adjacent roles in ${familyMatch.candidate_family}.`]
      : [];

  const decision_summary =
    decision_action === 'eligible_pass'
      ? 'Strong match for this role based on skills, experience, and resume quality.'
      : decision_action === 'eligible_review'
      ? 'Potential match that should be reviewed by a recruiter.'
      : decision_action === 'adjacent_role_recommendation'
      ? 'Experience is better aligned with adjacent roles rather than this exact posting.'
      : decision_action === 'tailor_before_apply'
      ? 'Resume and experience show some overlap, but tailoring is recommended before applying.'
      : eligibility.status === 'insufficient_data'
      ? 'Not enough structured information to confidently assess this application.'
      : 'This role does not appear to be a fit based on current evidence.';

  const decision_version = '3.0.0';

  const finalDecision: FinalATSDecision = {
    role_fit_score: role_fit_breakdown.role_fit_score,
    readability_score: readability_breakdown.readability_score,
    final_decision_score: finalScore,
    confidence,
    eligibility,
    family_match: familyMatch,
    decision_action,
    decision_summary,
    decision_version,
    role_fit_band,
    readability_band: readability_breakdown.readability_band,
    role_fit_breakdown,
    readability_breakdown,
    penalty_breakdown,
    critical_gaps,
    top_strengths: top_strengths.slice(0, 3),
    fix_priorities,
    adjacent_role_suggestions,
    scored_at: new Date().toISOString(),
  };

  return finalDecision;
}


