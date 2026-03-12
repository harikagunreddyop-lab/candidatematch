import { RoleFamily } from './types';
import { normalize } from './utils/text';
import { FAMILY_TAXONOMY } from './rules/family-taxonomy';

interface ClassificationResult {
  family: RoleFamily;
  confidence: number;
}

function scoreFamilyForTitlesAndText(
  family: RoleFamily,
  titles: string[],
  textSnippet: string,
): number {
  const taxonomy = FAMILY_TAXONOMY[family];
  if (!taxonomy) return 0;

  const normalizedTitles = titles.map((t) => normalize(t));
  const normalizedSnippet = normalize(textSnippet);

  let score = 0;

  // a. Exact canonical title match: +40
  const canonicalSet = new Set(
    taxonomy.canonical_titles.map((t) => normalize(t)),
  );
  if (
    normalizedTitles.some((title) => title && canonicalSet.has(title))
  ) {
    score += 40;
  }

  // b. Alias title match: +25
  const aliasSet = new Set(taxonomy.alias_titles.map((t) => normalize(t)));
  if (normalizedTitles.some((title) => title && aliasSet.has(title))) {
    score += 25;
  }

  // c. Title keyword present in any title: +15 (once)
  const keywordHitsInTitle = taxonomy.title_keywords.some((kwRaw) => {
    const kw = normalize(kwRaw);
    if (!kw) return false;
    return normalizedTitles.some(
      (title) => title && title.includes(kw),
    );
  });
  if (keywordHitsInTitle) {
    score += 15;
  }

  // d. Keyword appears in first 200 chars of resume/job text: +10
  const keywordHitsInSnippet = taxonomy.title_keywords.some((kwRaw) => {
    const kw = normalize(kwRaw);
    if (!kw) return false;
    return normalizedSnippet.includes(kw);
  });
  if (keywordHitsInSnippet) {
    score += 10;
  }

  return score;
}

export function classifyRoleFamily(
  titles: string[],
  resumeText: string,
  jobDomain?: string,
): ClassificationResult {
  const allFamilies = Object.keys(FAMILY_TAXONOMY) as RoleFamily[];
  const snippet = resumeText.slice(0, 200);

  let bestFamily: RoleFamily = 'general';
  let bestScore = 0;
  const normalizedJobDomain = jobDomain
    ? normalize(jobDomain)
    : '';

  for (const family of allFamilies) {
    if (family === 'general') continue;
    let score = scoreFamilyForTitlesAndText(family, titles, snippet);

    // Optional domain hint boost
    if (normalizedJobDomain && normalize(family) === normalizedJobDomain) {
      score += 10;
    }

    if (score > bestScore) {
      bestScore = score;
      bestFamily = family;
    }
  }

  if (bestScore < 15) {
    return { family: 'general', confidence: 40 };
  }

  const confidence = Math.min(100, bestScore);
  return { family: bestFamily, confidence };
}

export function classifyJobFamily(
  title: string,
  description: string,
): ClassificationResult {
  const snippet = description.slice(0, 1000);
  return classifyRoleFamily([title], snippet);
}


