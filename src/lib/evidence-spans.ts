/**
 * Evidence Spans — Citations linking dimension scores to resume/JD snippets.
 * Provides explainability: "Matched React" → "…Built React components for dashboards…"
 */

const MAX_SNIPPET_LEN = 70;
const CONTEXT_CHARS = 25;

/**
 * Extract a snippet from text around the first occurrence of a search term.
 * Uses case-insensitive search; returns trimmed snippet with ellipsis if truncated.
 */
export function extractSnippetAroundMatch(
  text: string,
  searchTerms: string[],
  maxLen: number = MAX_SNIPPET_LEN,
): string | null {
  const lower = text.toLowerCase();
  let bestIdx = -1;
  let bestLen = 0;

  for (const term of searchTerms) {
    const t = term.toLowerCase().trim();
    if (!t) continue;
    const idx = lower.indexOf(t);
    if (idx >= 0 && (bestIdx < 0 || idx < bestIdx)) {
      bestIdx = idx;
      bestLen = t.length;
    }
  }

  if (bestIdx < 0) return null;

  const start = Math.max(0, bestIdx - CONTEXT_CHARS);
  const end = Math.min(text.length, bestIdx + bestLen + CONTEXT_CHARS);
  let snippet = text.slice(start, end).trim();
  if (start > 0) snippet = '…' + snippet;
  if (end < text.length) snippet = snippet + '…';
  return snippet.length > maxLen ? snippet.slice(0, maxLen) + '…' : snippet;
}

export interface EvidenceSpan {
  /** The skill or requirement that was matched */
  skill: string;
  /** Snippet from resume showing where it appears */
  resume_snippet: string;
  /** Source of the requirement (which JD list it came from) */
  requirement_source?: 'must_have' | 'nice_to_have' | 'implicit';
}

/**
 * Build evidence spans for matched skills.
 * For each matched skill, finds a resume snippet and the requirement source.
 */
export function buildKeywordEvidenceSpans(
  matchedSkills: string[],
  resumeText: string,
  skillToTerms: (skill: string) => string[],
  skillToSource?: (skill: string) => EvidenceSpan['requirement_source'],
): EvidenceSpan[] {
  const result: EvidenceSpan[] = [];
  const seen = new Set<string>();

  for (const skill of matchedSkills) {
    if (seen.has(skill)) continue;
    seen.add(skill);
    const terms = [skill, ...skillToTerms(skill)];
    const snippet = extractSnippetAroundMatch(resumeText, terms);
    if (snippet) {
      result.push({
        skill,
        resume_snippet: snippet,
        requirement_source: skillToSource?.(skill),
      });
    }
    if (result.length >= 8) break; // Cap for UI
  }

  return result;
}
