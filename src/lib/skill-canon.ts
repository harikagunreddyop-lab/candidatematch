/**
 * Single canonicalizer for skills used across:
 * - JD requirements → job_skill_index
 * - Candidate profile/resume → candidate_skill_index
 * - ATS must-have matching
 *
 * All callers MUST use this to avoid “js” vs “javascript” drift.
 */

const RAW_SYNONYMS: Record<string, string[]> = {
  javascript: ['js', 'nodejs', 'node.js', 'ecmascript'],
  typescript: ['ts'],
  node: ['nodejs', 'node.js'],
  react: ['reactjs', 'react.js'],
  kubernetes: ['k8s', 'kubernetes'],
  postgres: ['postgresql', 'postgre', 'psql'],
  mysql: ['mariadb'],
  terraform: ['tf', 'terraform'],
  aws: ['amazon web services'],
  gcp: ['google cloud', 'google cloud platform'],
  azure: ['microsoft azure'],
};

const SKILL_SYNONYMS_MAP: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const [canon, alts] of Object.entries(RAW_SYNONYMS)) {
    m.set(canon, canon);
    for (const alt of alts) {
      m.set(alt.toLowerCase(), canon);
    }
  }
  return m;
})();

// Very lightweight stopwords to avoid indexing junk
const STOPWORDS = new Set([
  '',
  'and',
  'or',
  'the',
  'a',
  'an',
  'developer',
  'engineer',
  'senior',
  'junior',
  'manager',
  'lead',
  'software',
  'stack',
  'technology',
  'technologies',
]);

export const SKILL_SYNONYMS = SKILL_SYNONYMS_MAP;

/**
 * Canonicalize a raw skill string:
 * - trim, lowercase
 * - strip punctuation except + and # (for C++ / C#)
 * - collapse whitespace
 * - map known synonyms to a single canonical form
 * - return null for empty/stopword-like values
 */
export function canonicalizeSkill(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = String(raw).trim().toLowerCase();
  if (!s) return null;

  // Keep letters, numbers, +, # and spaces; drop other punctuation.
  s = s.replace(/[^a-z0-9#+\s]/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  if (!s || STOPWORDS.has(s)) return null;

  // Direct synonym map
  const mapped = SKILL_SYNONYMS_MAP.get(s);
  if (mapped) return mapped;

  return s;
}

