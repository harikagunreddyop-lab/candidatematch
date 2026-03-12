import { COMMON_SYNONYMS } from './common';
import { ENGINEERING_SYNONYMS } from './engineering';
import { DATA_SYNONYMS } from './data';
import { QA_COMPLIANCE_SYNONYMS } from './qa-compliance';
import { SUPPORT_SYNONYMS } from './support';

const ALL_SYNONYMS: Record<string, string[]> = {
  ...COMMON_SYNONYMS,
  ...ENGINEERING_SYNONYMS,
  ...DATA_SYNONYMS,
  ...QA_COMPLIANCE_SYNONYMS,
  ...SUPPORT_SYNONYMS,
};

export function getSynonyms(term: string): string[] {
  const normalized = term.toLowerCase().trim();
  const direct = ALL_SYNONYMS[normalized] ?? [];
  const reverse: string[] = [];

  for (const [canonical, syns] of Object.entries(ALL_SYNONYMS)) {
    if (syns.includes(normalized)) {
      reverse.push(canonical);
    }
  }

  return [...new Set([...direct, ...reverse])];
}

export function getAllSynonymMap(): Record<string, string[]> {
  return ALL_SYNONYMS;
}

