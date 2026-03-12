import {
  CanonicalJobProfile,
  CanonicalResumeProfile,
  PenaltyBreakdown,
  PenaltyItem,
  PenaltySeverity,
  RequirementClass,
  RequirementScore,
  RoleFamilyMatch,
  PENALTY_MULTIPLIERS,
} from './types';
import { parseDate, monthsBetween } from './utils/dates';
import { parseResumeSections, getSectionText } from './utils/sections';
import { normalize, tokenize } from './utils/text';

const SEVERITY_ORDER: PenaltySeverity[] = [
  'none',
  'mild',
  'moderate',
  'strong',
  'severe',
  'fatal',
];

function worseSeverity(a: PenaltySeverity, b: PenaltySeverity): PenaltySeverity {
  return SEVERITY_ORDER.indexOf(a) > SEVERITY_ORDER.indexOf(b) ? a : b;
}

function addPenalty(
  items: PenaltyItem[],
  type: string,
  severity: PenaltySeverity,
  detail: string,
): void {
  if (severity === 'none') return;
  items.push({
    type,
    severity,
    multiplier: PENALTY_MULTIPLIERS[severity],
    detail,
  });
}

export function computePenalties(
  familyMatch: RoleFamilyMatch,
  candidateProfile: CanonicalResumeProfile,
  jobProfile: CanonicalJobProfile,
  requirementScores: RequirementScore[],
): PenaltyBreakdown {
  const items: PenaltyItem[] = [];

  // 1. FAMILY_MISMATCH_PENALTY
  let familySeverity: PenaltySeverity = 'none';
  switch (familyMatch.match_type) {
    case 'mismatch':
      familySeverity = 'strong';
      break;
    case 'broad-related':
      familySeverity = 'moderate';
      break;
    case 'adjacent':
      familySeverity = 'mild';
      break;
    case 'exact':
      familySeverity = 'none';
      break;
    case 'forbidden':
      familySeverity = 'fatal';
      break;
  }
  addPenalty(
    items,
    'FAMILY_MISMATCH_PENALTY',
    familySeverity,
    `Role family match type: ${familyMatch.match_type}`,
  );

  // 2. STALE_EVIDENCE_PENALTY
  const critical_musts = requirementScores.filter(
    (s) => s.requirement.class === ('critical_must' as RequirementClass),
  );
  const stale_count = critical_musts.filter((s) => s.recency === 'stale').length;
  if (stale_count >= 2) {
    addPenalty(
      items,
      'STALE_EVIDENCE_PENALTY',
      'moderate',
      'Multiple critical requirements are based on stale experience.',
    );
  } else if (stale_count === 1) {
    addPenalty(
      items,
      'STALE_EVIDENCE_PENALTY',
      'mild',
      'One critical requirement is based on stale experience.',
    );
  }

  // 3. SHALLOW_MENTION_PENALTY
  const critical_listed_only = critical_musts.filter(
    (s) => s.grade === 'listed',
  ).length;
  if (critical_listed_only >= 3) {
    addPenalty(
      items,
      'SHALLOW_MENTION_PENALTY',
      'moderate',
      'Several critical requirements appear only in shallow/listed form.',
    );
  } else if (critical_listed_only >= 2) {
    addPenalty(
      items,
      'SHALLOW_MENTION_PENALTY',
      'mild',
      'Some critical requirements appear only in shallow/listed form.',
    );
  }

  // 4. ACADEMIC_ONLY_PENALTY
  if (
    (jobProfile.min_years ?? 0) > 2 &&
    candidateProfile.total_years_experience < 1 &&
    candidateProfile.education.length > 0
  ) {
    addPenalty(
      items,
      'ACADEMIC_ONLY_PENALTY',
      'strong',
      'Role expects professional experience beyond academic work.',
    );
  }

  // 5. UNSUPPORTED_SENIORITY_PENALTY
  if (
    jobProfile.seniority &&
    ['staff', 'principal', 'lead'].includes(jobProfile.seniority) &&
    candidateProfile.experience.every((e) => !e.has_ownership_language)
  ) {
    addPenalty(
      items,
      'UNSUPPORTED_SENIORITY_PENALTY',
      'moderate',
      'Senior role but no ownership/leadership language detected.',
    );
  }

  // 6. CHRONOLOGY_ANOMALY_PENALTY
  type Interval = { start: Date; end: Date };
  const intervals: Interval[] = [];
  for (const e of candidateProfile.experience) {
    const start = e.start_date ? parseDate(e.start_date) : null;
    const end = e.end_date ? parseDate(e.end_date) : e.is_current ? new Date() : null;
    if (start && end) {
      intervals.push({ start, end });
    }
  }

  let hasOverlap = false;
  let hasLargeGap = false;

  if (intervals.length >= 2) {
    intervals.sort((a, b) => a.start.getTime() - b.start.getTime());
    let prev = intervals[0];

    for (let i = 1; i < intervals.length; i++) {
      const curr = intervals[i];
      if (curr.start < prev.end) {
        hasOverlap = true;
      } else {
        const gapMonths = monthsBetween(prev.end, curr.start);
        if (gapMonths > 18) {
          hasLargeGap = true;
        }
      }
      if (curr.end > prev.end) {
        prev = curr;
      }
    }
  }

  if (hasOverlap || hasLargeGap) {
    const severity: PenaltySeverity =
      hasOverlap && hasLargeGap ? 'moderate' : 'mild';
    addPenalty(
      items,
      'CHRONOLOGY_ANOMALY_PENALTY',
      severity,
      hasOverlap && hasLargeGap
        ? 'Both overlapping roles and large employment gaps detected.'
        : hasOverlap
        ? 'Overlapping employment dates detected.'
        : 'Large employment gap detected.',
    );
  }

  // 7. STUFFING_PENALTY
  const sections = parseResumeSections(candidateProfile.resume_text);
  const skillsSection = getSectionText(sections, 'skills');
  const skillsWords = tokenize(skillsSection);
  const skillsWordCount = skillsWords.length;

  if (skillsWordCount > 0) {
    const normalizedSkillsText = normalize(skillsSection);
    const all_keywords = jobProfile.requirements.map((r) => r.normalized);

    let keywordMatches = 0;
    for (const kw of all_keywords) {
      if (!kw) continue;
      const re = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      const matches = normalizedSkillsText.match(re);
      if (matches) keywordMatches += matches.length;
    }

    const density = skillsWordCount > 0 ? keywordMatches / skillsWordCount : 0;
    if (density > 0.35) {
      addPenalty(
        items,
        'STUFFING_PENALTY',
        'mild',
        'Skills section appears overly keyword-dense; may indicate keyword stuffing.',
      );
    }
  }

  // Combined multiplier
  let combined_multiplier = 1.0;
  let dominant_penalty: PenaltySeverity = 'none';

  const hasFatal = items.some((i) => i.severity === 'fatal');
  if (hasFatal) {
    combined_multiplier = 0.0;
    dominant_penalty = 'fatal';
  } else {
    for (const item of items) {
      combined_multiplier *= item.multiplier;
      dominant_penalty = worseSeverity(dominant_penalty, item.severity);
    }
  }

  return {
    combined_multiplier,
    items,
    dominant_penalty,
  };
}


