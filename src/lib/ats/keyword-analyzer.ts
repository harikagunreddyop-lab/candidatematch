/**
 * Keyword Analyzer — deterministic
 *
 * Implements the keyword matching logic documented across the top ATS platforms:
 * - Taleo: exact literal match, case-insensitive, no tense/plural/abbreviation inference
 * - iCIMS: frequency-weighted match, generates skill list from full text
 * - SmartRecruiters: exact match, zero credit for synonyms
 *
 * We solve the "Taleo problem" by requiring the JD extractor to list BOTH forms
 * (e.g. "PMP" and "Project Management Professional") as separate keywords.
 *
 * We add a curated synonym map for common tech abbreviations that every ATS
 * recognizes in practice (validated across Greenhouse/Lever/iCIMS testing).
 *
 * Keyword density sweet spot: 8-12% (Jobscan validated, cross-platform research).
 * Max 2-3 uses per keyword before diminishing returns (Jobscan recommendation).
 */

import type { JobRequirements, KeywordCoverageResult } from './types';

// Curated synonyms — ONLY pairs that are unambiguous across all major ATS
// Evidence: Jobscan, GetBridged, and direct ATS testing reports
const SYNONYM_MAP: Record<string, string[]> = {
  'javascript': ['js', 'ecmascript'],
  'typescript': ['ts'],
  'node.js': ['nodejs', 'node'],
  'react.js': ['reactjs', 'react'],
  'vue.js': ['vuejs', 'vue'],
  'angular': ['angularjs', 'angular.js'],
  'postgresql': ['postgres', 'psql'],
  'mongodb': ['mongo'],
  'kubernetes': ['k8s'],
  'amazon web services': ['aws'],
  'google cloud platform': ['gcp'],
  'microsoft azure': ['azure'],
  'continuous integration': ['ci'],
  'continuous deployment': ['cd'],
  'ci/cd': ['continuous integration', 'continuous deployment'],
  'machine learning': ['ml'],
  'artificial intelligence': ['ai'],
  'natural language processing': ['nlp'],
  'application programming interface': ['api'],
  'graphql': ['graph ql'],
  'python': ['py'],
  'docker': ['containerization', 'containers'],
  'mysql': ['my sql'],
  'nosql': ['no-sql', 'no sql'],
  'rest': ['restful', 'rest api'],
  'sql': ['structured query language'],
};

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function getSynonyms(term: string): string[] {
  const n = normalize(term);
  const direct = SYNONYM_MAP[n] ?? [];
  // Reverse lookup
  const reverse: string[] = [];
  for (const [canonical, syns] of Object.entries(SYNONYM_MAP)) {
    if (syns.includes(n)) reverse.push(canonical);
  }
  return [...direct, ...reverse];
}

/**
 * Count occurrences of a term (and its synonyms) in text.
 * Returns { exact, synonym } counts.
 */
export function countOccurrences(
  term: string,
  text: string,
): { exact: number; synonym: number } {
  const normalText = normalize(text);
  const normalTerm = normalize(term);

  // Exact count — whole word boundary
  const exactRe = new RegExp(`\\b${normalTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
  const exact = (normalText.match(exactRe) ?? []).length;

  // Synonym count
  let synonym = 0;
  for (const syn of getSynonyms(term)) {
    const synRe = new RegExp(`\\b${normalize(syn).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
    synonym += (normalText.match(synRe) ?? []).length;
  }

  return { exact, synonym };
}

/**
 * Score keyword density quality.
 * Research basis: 8-12% is validated sweet spot (Jobscan cross-platform data).
 * Under 8% = too sparse, over 15% = flagged as stuffing.
 */
function scoreDensity(resumeText: string, matchedKeywords: string[]): number {
  const words = resumeText.split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;

  // Count keyword word-tokens matched
  let keywordTokens = 0;
  for (const kw of matchedKeywords) {
    keywordTokens += kw.split(/\s+/).length;
  }

  const density = keywordTokens / words.length;

  if (density < 0.04) return 20;
  if (density < 0.06) return 50;
  if (density < 0.08) return 70;
  if (density <= 0.12) return 100; // sweet spot
  if (density <= 0.15) return 80;  // slightly high but ok
  return 40; // stuffing territory
}

/**
 * Score keyword placement quality.
 * Research basis:
 * - iCIMS weights experience bullet keywords more than skills-list-only keywords
 * - Greenhouse specifically focuses on Skills section AND experience bullets
 * - All systems: keywords in experience bullets > keywords only in skills list
 */
function scorePlacement(
  matchedKeywords: string[],
  experienceBullets: string[],
  skillsText: string,
): number {
  if (matchedKeywords.length === 0) return 0;

  const bulletText = experienceBullets.join(' ');
  let inBullets = 0;
  let onlyInSkillsList = 0;

  for (const kw of matchedKeywords) {
    const norm = normalize(kw);
    const inBullet = normalize(bulletText).includes(norm);
    const inSkills = normalize(skillsText).includes(norm);

    if (inBullet) inBullets++;
    else if (inSkills) onlyInSkillsList++;
  }

  const bulletRate = inBullets / matchedKeywords.length;
  const listOnlyRate = onlyInSkillsList / matchedKeywords.length;

  // Ideal: all keywords evidenced in bullets. Penalty for list-only.
  return Math.round(100 * (bulletRate * 1.0 + listOnlyRate * 0.5));
}

export function analyzeKeywords(
  requirements: JobRequirements,
  resumeText: string,
  experienceBullets: string[],
  skillsListText: string,
): KeywordCoverageResult {
  const matchedExact: string[] = [];
  const matchedSynonym: string[] = [];
  const matchedImplicit: string[] = [];
  const missingMustHave: string[] = [];
  const missingNiceToHave: string[] = [];

  const allText = resumeText;

  // Check must-haves
  for (const skill of requirements.must_have_skills) {
    const { exact, synonym } = countOccurrences(skill, allText);
    if (exact > 0) matchedExact.push(skill);
    else if (synonym > 0) matchedSynonym.push(skill);
    else missingMustHave.push(skill);
  }

  // Check nice-to-haves
  for (const skill of requirements.nice_to_have_skills) {
    const { exact, synonym } = countOccurrences(skill, allText);
    if (exact > 0 || synonym > 0) matchedExact.push(skill);
    else missingNiceToHave.push(skill);
  }

  // Check implicits (bonus only, no penalty)
  for (const skill of requirements.implicit_skills) {
    const { exact, synonym } = countOccurrences(skill, allText);
    if (exact > 0 || synonym > 0) matchedImplicit.push(skill);
  }

  const totalMust = requirements.must_have_skills.length;
  const mustCoveredCount = totalMust - missingMustHave.length;
  const mustCoverageRate = totalMust > 0 ? mustCoveredCount / totalMust : 1;

  const totalNice = requirements.nice_to_have_skills.length;
  const niceCoveredCount = totalNice - missingNiceToHave.length;
  const niceCoverageRate = totalNice > 0 ? niceCoveredCount / totalNice : 1;

  // Blended coverage: must-haves are 80% of coverage score, nice-to-haves 20%
  const coverageRate = 0.80 * mustCoverageRate + 0.20 * niceCoverageRate;

  const allMatched = [...matchedExact, ...matchedSynonym, ...matchedImplicit];

  const densityScore = scoreDensity(resumeText, allMatched);
  const placementScore = scorePlacement(allMatched, experienceBullets, skillsListText);

  return {
    total_jd_keywords: requirements.must_have_skills.length + requirements.nice_to_have_skills.length,
    matched_exact: matchedExact,
    matched_synonym: matchedSynonym,
    matched_implicit: matchedImplicit,
    missing_must_have: missingMustHave,
    missing_nice_to_have: missingNiceToHave,
    coverage_rate: coverageRate,
    density_score: densityScore,
    placement_score: placementScore,
  };
}

