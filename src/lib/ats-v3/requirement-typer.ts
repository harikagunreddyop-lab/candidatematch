
import {
  CanonicalJobProfile,
  CanonicalResumeProfile,
  RequirementClass,
  RequirementScore,
  EvidenceGrade,
  RecencyBand,
  EVIDENCE_GRADE_VALUES,
  RECENCY_MULTIPLIERS,
} from './types';
import { getSynonyms } from './synonyms';
import { findBestMatch } from './utils/matching';
import { containsWholeWord, normalize } from './utils/text';

function pickSkillEvidenceForRequirement(
  requirementNormalized: string,
  candidateProfile: CanonicalResumeProfile,
) {
  // Match by normalized skill string in the evidence map.
  for (const evidence of candidateProfile.skill_evidence.values()) {
    if (evidence.normalized === requirementNormalized) {
      return evidence;
    }
  }
  return null;
}

function bulletMatchesRequirement(
  bullet: string,
  requirementTerm: string,
  synonyms: string[],
): boolean {
  if (containsWholeWord(bullet, requirementTerm)) return true;
  for (const syn of synonyms) {
    if (containsWholeWord(bullet, syn)) return true;
  }
  return false;
}

function inferGradeFromMatch(
  matchMethod: RequirementScore['matched_by'],
  inExperienceBullets: boolean,
): EvidenceGrade {
  if (matchMethod === 'none') return 'none';
  if (matchMethod === 'partial') return 'weak';
  if (matchMethod === 'synonym') return 'listed';

  // exact
  if (inExperienceBullets) {
    return 'contextual';
  }
  return 'listed';
}

export function scoreRequirements(
  jobProfile: CanonicalJobProfile,
  candidateProfile: CanonicalResumeProfile,
): RequirementScore[] {
  const scores: RequirementScore[] = [];
  const resumeText = candidateProfile.resume_text;

  for (const requirement of jobProfile.requirements) {
    const baseNormalized =
      requirement.normalized || normalize(requirement.term);
    const synonyms = getSynonyms(baseNormalized);

    // Build a minimal synonym map for this term.
    const synonymMap: Record<string, string[]> = {
      [baseNormalized]: synonyms,
    };

    const matchResult = findBestMatch(
      baseNormalized,
      resumeText,
      synonymMap,
    );

    const skillEvidence = pickSkillEvidenceForRequirement(
      baseNormalized,
      candidateProfile,
    );

    const experienceBullets = candidateProfile.experience.flatMap(
      (exp) => exp.bullets || [],
    );

    const evidence_snippets: string[] = [];
    let in_experience_bullets = false;

    for (const bullet of experienceBullets) {
      if (
        bulletMatchesRequirement(
          bullet,
          requirement.term,
          synonyms,
        )
      ) {
        in_experience_bullets = true;
        if (evidence_snippets.length < 2) {
          evidence_snippets.push(bullet.trim());
        }
      }
    }

    let grade: EvidenceGrade;
    let recency: RecencyBand;
    let recency_multiplier: number;
    let grade_value: number;
    let effective_credit: number;

    if (skillEvidence) {
      grade = skillEvidence.grade;
      recency = skillEvidence.recency;
      recency_multiplier = skillEvidence.recency_multiplier;
      grade_value = EVIDENCE_GRADE_VALUES[grade];
      effective_credit = skillEvidence.effective_credit;
    } else {
      grade = inferGradeFromMatch(
        matchResult.method,
        in_experience_bullets,
      );
      recency = 'undated';
      recency_multiplier = RECENCY_MULTIPLIERS[recency];
      grade_value = EVIDENCE_GRADE_VALUES[grade];
      effective_credit = grade_value * recency_multiplier;
    }

    const score: RequirementScore = {
      requirement,
      grade,
      grade_value,
      recency,
      recency_multiplier,
      effective_credit,
      matched_by: matchResult.method,
      evidence_snippets,
    };

    scores.push(score);
  }

  return scores;
}

export function computeRequirementCoverage(
  scores: RequirementScore[],
  cls: RequirementClass,
): number {
  const filtered = scores.filter(
    (s) => s.requirement.class === cls,
  );
  if (!filtered.length) return 1.0;

  const total = filtered.reduce(
    (sum, s) => sum + s.effective_credit,
    0,
  );
  return filtered.length ? total / filtered.length : 1.0;
}


