import {
  CanonicalJobProfile,
  CanonicalResumeProfile,
  EligibilityResult,
  RequirementClass,
  RequirementScore,
  RoleFamilyMatch,
} from './types';
import { getRubric } from './rubrics/registry';

export function checkEligibility(
  jobProfile: CanonicalJobProfile,
  candidateProfile: CanonicalResumeProfile,
  requirementScores: RequirementScore[],
  familyMatch: RoleFamilyMatch,
): EligibilityResult {
  const reasons: string[] = [];
  const fatal_blocks: string[] = [];
  const review_flags: string[] = [];
  const missing_fatal: string[] = [];
  const missing_critical: string[] = [];

  let hardReject = false;
  let reviewNeeded = false;

  // ─── STAGE 1: Resume Viability ─────────────────────────────────────────────

  if (candidateProfile.parse_quality < 20) {
    const msg = 'Resume could not be parsed reliably';
    reasons.push(msg);
    fatal_blocks.push(msg);
    return {
      status: 'hard_reject',
      gate_passed: false,
      reasons,
      fatal_blocks,
      review_flags,
      missing_fatal,
      missing_critical,
    };
  }

  if (
    candidateProfile.total_years_experience === 0 &&
    candidateProfile.experience.length === 0
  ) {
    const msg = 'No work experience detected';
    reasons.push(msg);
    return {
      status: 'insufficient_data',
      gate_passed: false,
      reasons,
      fatal_blocks,
      review_flags,
      missing_fatal,
      missing_critical,
    };
  }

  // ─── STAGE 2: Role Family Compatibility ────────────────────────────────────

  if (familyMatch.match_type === 'forbidden') {
    const msg = `Role family is incompatible: ${familyMatch.candidate_family} applying to ${familyMatch.job_family}`;
    reasons.push(msg);
    fatal_blocks.push(msg);
    hardReject = true;
  } else if (familyMatch.match_type === 'mismatch') {
    const msg = 'Role family mismatch: insufficient domain overlap';
    reasons.push(msg);
    fatal_blocks.push(msg);
    hardReject = true;
  } else if (familyMatch.match_type === 'broad-related') {
    const msg = 'Broad role family match — cross-domain candidate';
    reasons.push(msg);
    review_flags.push(msg);
    reviewNeeded = true;
  } else if (familyMatch.match_type === 'adjacent') {
    const msg = 'Adjacent role family — review for transferable skills';
    reasons.push(msg);
    review_flags.push(msg);
    reviewNeeded = true;
  }

  // ─── STAGE 3: Fatal Must Requirements ──────────────────────────────────────

  const fatalMissing = requirementScores
    .filter(
      (s) =>
        s.requirement.class === ('fatal_must' as RequirementClass) &&
        s.grade === 'none',
    )
    .map((s) => s.requirement.term);

  if (fatalMissing.length > 0) {
    const msg = `Missing non-negotiable requirements: ${fatalMissing.join(
      ', ',
    )}`;
    reasons.push(msg);
    fatal_blocks.push(msg);
    missing_fatal.push(...fatalMissing);
    hardReject = true;
  }

  // ─── STAGE 4: Seniority Compatibility ──────────────────────────────────────

  const jobSeniority = jobProfile.seniority;
  const candSeniority = candidateProfile.inferred_seniority;

  if (
    (jobSeniority === 'staff' || jobSeniority === 'principal') &&
    (candSeniority === 'intern' || candSeniority === 'junior')
  ) {
    const msg = 'Seniority gap too large for this role level';
    reasons.push(msg);
    fatal_blocks.push(msg);
    hardReject = true;
  }

  if (
    (jobSeniority === 'director' || jobSeniority === 'manager') &&
    !candidateProfile.experience.some((e) => e.has_ownership_language) &&
    candidateProfile.total_years_experience < 5
  ) {
    const msg = 'Management role requires leadership evidence';
    reasons.push(msg);
    review_flags.push(msg);
    reviewNeeded = true;
  }

  // ─── STAGE 5: Critical Must Coverage ───────────────────────────────────────

  const criticalScores = requirementScores.filter(
    (s) => s.requirement.class === ('critical_must' as RequirementClass),
  );
  const rubric = getRubric(jobProfile.family);

  if (criticalScores.length > 0) {
    const criticalMissingTerms = criticalScores
      .filter((s) => s.effective_credit < 0.35)
      .map((s) => s.requirement.term);

    missing_critical.push(...criticalMissingTerms);

    const coverageRate =
      (criticalScores.length - criticalMissingTerms.length) /
      criticalScores.length;

    if (coverageRate < rubric.min_critical_must_coverage) {
      if (coverageRate >= 0.5) {
        const msg =
          'Critical requirements coverage below ideal threshold — manual review recommended';
        reasons.push(msg);
        review_flags.push(msg);
        reviewNeeded = true;
      } else {
        const msg =
          'Critical requirements missing beyond acceptable threshold';
        reasons.push(msg);
        fatal_blocks.push(msg);
        hardReject = true;
      }
    }
  }

  // ─── FINAL STATUS ──────────────────────────────────────────────────────────

  let status: EligibilityResult['status'];
  let gate_passed: boolean;

  if (hardReject) {
    status = 'hard_reject';
    gate_passed = false;
  } else if (reviewNeeded) {
    status = 'eligible_with_review';
    gate_passed = true;
  } else {
    status = 'eligible';
    gate_passed = true;
  }

  return {
    status,
    gate_passed,
    reasons,
    fatal_blocks,
    review_flags,
    missing_fatal,
    missing_critical,
  };
}


