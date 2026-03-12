const ACTION_VERBS = [
  'built',
  'led',
  'managed',
  'designed',
  'implemented',
  'developed',
  'created',
  'deployed',
  'scaled',
  'improved',
  'reduced',
  'increased',
  'automated',
  'architected',
  'migrated',
  'owned',
  'delivered',
  'drove',
  'launched',
  'shipped',
];

/**
 * Lowercase, strip punctuation (except hyphens), collapse whitespace.
 */
export function normalize(s: string): string {
  const lower = s.toLowerCase();
  // Remove everything except word chars, whitespace, and hyphens
  const stripped = lower.replace(/[^\w\s-]+/g, ' ');
  return stripped.replace(/\s+/g, ' ').trim();
}

/**
 * Tokenize normalized text into words, dropping very short tokens.
 */
export function tokenize(s: string): string[] {
  const norm = normalize(s);
  if (!norm) return [];
  return norm
    .split(' ')
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

function escapeRegex(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Case-insensitive whole-word containment, supports multi-word terms.
 */
export function containsWholeWord(text: string, term: string): boolean {
  if (!term.trim()) return false;
  const pattern = `\\b${escapeRegex(term.trim())}\\b`;
  const re = new RegExp(pattern, 'i');
  return re.test(text);
}

/**
 * Count whole-word occurrences of a term in text.
 */
export function countOccurrences(text: string, term: string): number {
  if (!term.trim()) return 0;
  const pattern = `\\b${escapeRegex(term.trim())}\\b`;
  const re = new RegExp(pattern, 'gi');
  const matches = text.match(re);
  return matches ? matches.length : 0;
}

/**
 * Extract lines/sentences that start with an action verb.
 */
export function extractActionBullets(text: string): string[] {
  if (!text.trim()) return [];

  const results: string[] = [];
  const verbPattern = new RegExp(
    `^(${ACTION_VERBS.join('|')})\\b`,
    'i',
  );

  const lines = text.split(/\r?\n/);
  for (const rawLine of lines) {
    let line = rawLine.trim();
    if (!line) continue;

    // Strip common bullet markers
    line = line.replace(/^[\u2022•\-*]\s+/, '');
    line = line.replace(/^\d+\.\s+/, '');

    if (verbPattern.test(line)) {
      results.push(line);
      continue;
    }

    // Fallback: split long lines into sentences and test each
    const sentences = line.split(/(?<=[.!?])\s+/);
    for (const sentence of sentences) {
      const s = sentence.trim();
      if (!s) continue;
      if (verbPattern.test(s)) {
        results.push(s);
      }
    }
  }

  return results;
}

/**
 * Detect if a bullet contains a number + unit pattern.
 */
export function hasMetrics(bullet: string): boolean {
  if (!bullet) return false;
  const pattern =
    /\b\d+(?:\.\d+)?\s*(%|\$|x|k|m|b|users?|requests?|reqs?|ms|milliseconds?|seconds?|secs?|hours?|hrs?|days?)\b/i;
  return pattern.test(bullet);
}

/**
 * Detect ownership / leadership language in a bullet.
 */
export function hasOwnershipLanguage(bullet: string): boolean {
  if (!bullet) return false;
  const lower = bullet.toLowerCase();
  return (
    lower.includes('owned') ||
    lower.includes('responsible for') ||
    lower.includes(' led ') ||
    lower.startsWith('led ') ||
    lower.includes('drove') ||
    lower.includes('architected') ||
    lower.includes('headed') ||
    lower.includes('spearheaded') ||
    lower.includes('single-handedly')
  );
}


