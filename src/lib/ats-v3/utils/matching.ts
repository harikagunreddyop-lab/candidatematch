import { containsWholeWord } from './text';

export interface MatchResult {
  matched: boolean;
  method: 'exact' | 'synonym' | 'partial' | 'none';
  score: number;
}

export function matchTerm(
  term: string,
  text: string,
  synonyms: string[],
): MatchResult {
  const normalizedTerm = term.trim();
  if (!normalizedTerm) {
    return { matched: false, method: 'none', score: 0 };
  }

  // 1. Exact whole-word match
  if (containsWholeWord(text, normalizedTerm)) {
    return { matched: true, method: 'exact', score: 1.0 };
  }

  // 2. Any synonym whole-word match
  for (const syn of synonyms || []) {
    if (!syn) continue;
    if (containsWholeWord(text, syn)) {
      return { matched: true, method: 'synonym', score: 0.85 };
    }
  }

  // 3. Partial match inside a compound word
  const lowerText = text.toLowerCase();
  const lowerTerm = normalizedTerm.toLowerCase();

  // Look for term as substring in tokens, but not as standalone word (already checked)
  const tokens = lowerText.split(/[^a-z0-9+]+/);
  const partialHit = tokens.some(
    (tok) => tok.length > lowerTerm.length && tok.includes(lowerTerm),
  );

  if (partialHit) {
    return { matched: true, method: 'partial', score: 0.5 };
  }

  // 4. No match
  return { matched: false, method: 'none', score: 0.0 };
}

export function findBestMatch(
  term: string,
  resumeText: string,
  synonymMap: Record<string, string[]>,
): MatchResult {
  const synonyms = synonymMap[term] || [];
  return matchTerm(term, resumeText, synonyms);
}


