import {
  CanonicalJobProfile,
  CanonicalResumeProfile,
  RECENCY_MULTIPLIERS,
  RequirementClass,
  RequirementScore,
  RoleFamilyMatch,
  RoleFitBreakdown,
} from './types';
import { getRubric } from './rubrics/registry';
import { computeRequirementCoverage } from './requirement-typer';
import { hasMetrics, hasOwnershipLanguage, normalize, tokenize } from './utils/text';

function clip(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

const STOP_WORDS = new Set<string>([
  'the',
  'and',
  'for',
  'with',
  'that',
  'this',
  'you',
  'your',
  'our',
  'are',
  'will',
  'to',
  'of',
  'in',
  'on',
  'a',
  'an',
  'as',
  'by',
  'at',
  'from',
  'or',
  'be',
  'is',
  'was',
  'were',
  'we',
  'they',
  'their',
  'it',
  'its',
  'into',
  'within',
  'across',
  'including',
  'include',
  'using',
  'use',
  'ensure',
  'build',
  'built',
  'design',
  'develop',
  'implement',
  'work',
  'experience',
  'responsible',
  'responsibilities',
]);

function extractKeywords(s: string): string[] {
  const toks = tokenize(s).filter((t) => t.length >= 3 && !STOP_WORDS.has(t));
  return Array.from(new Set(toks));
}

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function countMatches(text: string, patterns: RegExp[]): number {
  let total = 0;
  for (const re of patterns) {
    const m = text.match(re);
    if (m) total += m.length;
  }
  return total;
}

export function scoreRoleFit(
  jobProfile: CanonicalJobProfile,
  candidateProfile: CanonicalResumeProfile,
  requirementScores: RequirementScore[],
  familyMatch: RoleFamilyMatch,
): RoleFitBreakdown {
  const rubric = getRubric(jobProfile.family);

  // 1. REQUIREMENT_COVERAGE
  const fatal_coverage = computeRequirementCoverage(requirementScores, 'fatal_must');
  const critical_coverage = computeRequirementCoverage(requirementScores, 'critical_must');
  const standard_coverage = computeRequirementCoverage(requirementScores, 'standard_must');
  const preferred_coverage = computeRequirementCoverage(requirementScores, 'preferred');

  const requirement_coverage =
    100 *
    (0.35 * fatal_coverage +
      0.4 * critical_coverage +
      0.15 * standard_coverage +
      0.1 * preferred_coverage);

  // 2. RESPONSIBILITY_ALIGNMENT
  const jdResponsibilities = jobProfile.responsibilities ?? [];
  const candidateBullets = candidateProfile.experience.flatMap((e) => e.bullets || []);
  const candidateBulletsText = normalize(candidateBullets.join(' '));

  const overlapRatios: number[] = [];
  for (const resp of jdResponsibilities) {
    const kws = extractKeywords(resp);
    if (kws.length === 0) {
      overlapRatios.push(0.3); // neutral floor
      continue;
    }
    const hits = kws.filter((kw) => candidateBulletsText.includes(kw)).length;
    const overlap = hits / kws.length;
    const floored = 0.3 + 0.7 * overlap;
    overlapRatios.push(floored);
  }
  const responsibility_alignment = 100 * (overlapRatios.length ? avg(overlapRatios) : 0.8);

  // 3. DOMAIN_RELEVANCE
  let family_alignment = 80;
  if (jobProfile.family === 'general') {
    family_alignment = 80;
  } else if (familyMatch.match_type === 'exact') {
    family_alignment = 100;
  } else if (familyMatch.match_type === 'adjacent') {
    family_alignment = 70;
  } else if (familyMatch.match_type === 'broad-related') {
    family_alignment = 45;
  } else {
    family_alignment = 20;
  }

  let industry_bonus = 0;
  if (jobProfile.industry_vertical) {
    const needle = jobProfile.industry_vertical.toLowerCase();
    if (candidateProfile.resume_text.toLowerCase().includes(needle)) {
      industry_bonus = 10;
    }
  }
  const domain_relevance = Math.min(100, family_alignment + industry_bonus);

  // 4. SENIORITY_FIT
  const years_candidate = candidateProfile.total_years_experience;
  const years_min = jobProfile.min_years ?? 0;
  const years_preferred = jobProfile.preferred_years ?? years_min + 2;

  let years_fit = 100;
  if (years_candidate >= years_min && years_candidate <= years_preferred) {
    years_fit = 100;
  } else if (years_candidate < years_min) {
    const gap = years_min - years_candidate;
    years_fit = Math.max(20, 100 - gap * 18);
  } else {
    const gap = years_candidate - years_preferred;
    years_fit = Math.max(65, 100 - gap * 4);
  }
  const seniority_fit = years_fit;

  // 5. TOOL_PLATFORM_EVIDENCE
  const tool_requirements = requirementScores.filter((s) =>
    (['standard_must', 'preferred'] as RequirementClass[]).includes(s.requirement.class),
  );
  const tool_platform_evidence =
    tool_requirements.length === 0 ? 80 : 100 * avg(tool_requirements.map((s) => s.effective_credit));

  // 6. RECENCY_WEIGHTED_SCORE
  const must_scores = requirementScores.filter((s) =>
    (['fatal_must', 'critical_must'] as RequirementClass[]).includes(s.requirement.class),
  );
  const recency_weighted_score =
    must_scores.length === 0
      ? 80
      : 100 *
        avg(
          must_scores.map((s) => RECENCY_MULTIPLIERS[s.recency]),
        );

  // 7. EVIDENCE_DEPTH
  const allBullets = candidateProfile.experience.flatMap((e) => e.bullets || []);
  const total_bullets = allBullets.length;
  const bullets_with_ownership = allBullets.filter((b) => hasOwnershipLanguage(b)).length;
  const bullets_with_metrics = allBullets.filter((b) => hasMetrics(b)).length;

  let evidence_depth = 30;
  if (total_bullets > 0) {
    const ownership_rate = bullets_with_ownership / total_bullets;
    const metric_rate = bullets_with_metrics / total_bullets;
    evidence_depth = Math.min(100, 20 + 50 * ownership_rate + 30 * metric_rate);
  }

  // 8. IMPACT_SCOPE
  const resumeLower = candidateProfile.resume_text.toLowerCase();
  const leadership_signals = countMatches(resumeLower, [
    /\bled\b/g,
    /\bmanaged\b/g,
    /\bdirected\b/g,
    /\bmentored\b/g,
    /\bheaded\b/g,
  ]);

  const scale_signals = countMatches(candidateProfile.resume_text, [
    /\bmillion\b/gi,
    /\bbillion\b/gi,
    /\b10k\+\b/gi,
    /\b\d+%\b/g,
    /\b\d+x\s/gi,
  ]);

  const leadership_score = Math.min(100, 20 * leadership_signals);
  const scale_score = Math.min(100, 20 * scale_signals);
  let impact_scope = 0.5 * leadership_score + 0.5 * scale_score;
  if (impact_scope === 0) impact_scope = 30;

  // FINAL WEIGHTED SCORE
  const weighted =
    requirement_coverage * rubric.weights.requirement_coverage +
    responsibility_alignment * rubric.weights.responsibility_alignment +
    domain_relevance * rubric.weights.domain_relevance +
    seniority_fit * rubric.weights.seniority_fit +
    tool_platform_evidence * rubric.weights.tool_platform_evidence +
    recency_weighted_score * rubric.weights.recency_weighted_score +
    evidence_depth * rubric.weights.evidence_depth +
    impact_scope * rubric.weights.impact_scope;

  const role_fit_score = Math.round(clip(weighted, 0, 100));

  const matched_requirements = requirementScores
    .filter((s) => s.grade !== 'none')
    .map((s) => s.requirement.term);
  const missing_requirements = requirementScores
    .filter((s) => s.grade === 'none')
    .map((s) => s.requirement.term);

  const role_fit_breakdown: RoleFitBreakdown = {
    requirement_coverage: clip(requirement_coverage, 0, 100),
    responsibility_alignment: clip(responsibility_alignment, 0, 100),
    domain_relevance: clip(domain_relevance, 0, 100),
    seniority_fit: clip(seniority_fit, 0, 100),
    tool_platform_evidence: clip(tool_platform_evidence, 0, 100),
    recency_weighted_score: clip(recency_weighted_score, 0, 100),
    evidence_depth: clip(evidence_depth, 0, 100),
    impact_scope: clip(impact_scope, 0, 100),
    role_fit_score,
    requirement_scores: requirementScores,
    matched_requirements,
    missing_requirements,
    family_match: familyMatch,
    rubric_family: rubric.family,
    rubric_weights: {
      requirement_coverage: rubric.weights.requirement_coverage,
      responsibility_alignment: rubric.weights.responsibility_alignment,
      domain_relevance: rubric.weights.domain_relevance,
      seniority_fit: rubric.weights.seniority_fit,
      tool_platform_evidence: rubric.weights.tool_platform_evidence,
      recency_weighted_score: rubric.weights.recency_weighted_score,
      evidence_depth: rubric.weights.evidence_depth,
      impact_scope: rubric.weights.impact_scope,
    },
  };

  return role_fit_breakdown;
}


