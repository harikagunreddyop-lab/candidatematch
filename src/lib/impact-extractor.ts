/**
 * Impact & Metrics Extraction
 *
 * Extracts quantified outcomes from resume bullets for STAR-style scoring.
 * Patterns: percentages, currency, multipliers, reduction/increase phrases.
 */

export interface ImpactMetric {
  /** Truncated bullet snippet containing the metric */
  snippet: string;
  /** Rough type for explainability */
  type: 'percentage' | 'currency' | 'multiplier' | 'reduction' | 'improvement';
}

export interface ImpactExtractionResult {
  totalCount: number;
  examples: ImpactMetric[];
  bulletsWithImpact: number;
}

// Patterns that indicate quantified impact (order matters for extraction)
const IMPACT_PATTERNS: Array<{ regex: RegExp; type: ImpactMetric['type'] }> = [
  // Percentages: "increased by 25%", "reduced 40%", "20% improvement"
  { regex: /\d+%\s*(?:increase|decrease|reduction|improvement|growth|faster)?|(?:increased?|reduced?|improved?|decreased?)\s+(?:by\s+)?\d+%/gi, type: 'percentage' },
  // Currency: "$2M", "$500K", "saved $100,000"
  { regex: /\$[\d,.]+[kmb]?|saved\s+\$[\d,.]+|generated\s+\$[\d,.]+|revenue\s+(?:of\s+)?\$[\d,.]+/gi, type: 'currency' },
  // Multipliers: "2x faster", "3x increase", "10x growth"
  { regex: /\d+x\s+(?:faster|increase|improvement|growth|reduction|throughput)?/gi, type: 'multiplier' },
  // Reduction phrases: "reduced latency by 50ms", "cut costs by 30%"
  { regex: /reduced?\s+(?:\w+\s+)?by\s+[\d,.]+|cut\s+\w+\s+by\s+[\d,.]+|decreased?\s+[\w\s]+by\s+[\d,.]+/gi, type: 'reduction' },
  // Improvement phrases: "improved X by Y", "increased from A to B"
  { regex: /improved?\s+(?:\w+\s+)?(?:by|to)\s+[\d,.]+|increased?\s+(?:\w+\s+)?(?:from|by|to)\s+[\d,.]+|optimized?\s+[\w\s]+\s+(?:by|to)\s+[\d,.]+/gi, type: 'improvement' },
  // Standalone percentage in bullet
  { regex: /\d+%/g, type: 'percentage' },
];

const MAX_SNIPPET_LEN = 80;
const MAX_EXAMPLES = 5;

/**
 * Extract a short snippet around the first match in a bullet.
 */
function extractSnippet(bullet: string, match: RegExpExecArray): string {
  const start = Math.max(0, match.index - 15);
  const end = Math.min(bullet.length, match.index + match[0].length + 45);
  let snippet = bullet.slice(start, end).trim();
  if (start > 0) snippet = '…' + snippet;
  if (end < bullet.length) snippet = snippet + '…';
  return snippet.length > MAX_SNIPPET_LEN ? snippet.slice(0, MAX_SNIPPET_LEN) + '…' : snippet;
}

/**
 * Extract impact metrics from an array of resume bullet strings.
 */
export function extractImpactMetrics(bullets: string[]): ImpactExtractionResult {
  const examples: ImpactMetric[] = [];
  let totalCount = 0;
  const bulletsWithImpact = new Set<number>();

  for (let i = 0; i < bullets.length; i++) {
    const bullet = bullets[i];
    if (!bullet || typeof bullet !== 'string') continue;

    let foundInBullet = false;
    const seenSnippets = new Set<string>();

    for (const { regex, type } of IMPACT_PATTERNS) {
      const re = new RegExp(regex.source, regex.flags);
      let m: RegExpExecArray | null;
      while ((m = re.exec(bullet)) !== null && examples.length < MAX_EXAMPLES) {
        totalCount++;
        foundInBullet = true;
        const snippet = extractSnippet(bullet, m);
        if (!seenSnippets.has(snippet)) {
          seenSnippets.add(snippet);
          examples.push({ snippet, type });
        }
      }
    }

    if (foundInBullet) bulletsWithImpact.add(i);
  }

  return {
    totalCount,
    examples: examples.slice(0, MAX_EXAMPLES),
    bulletsWithImpact: bulletsWithImpact.size,
  };
}

/**
 * Extract impact metrics from candidate experience (responsibilities per role).
 */
export function extractImpactFromExperience(
  experience: Array<{ company?: string; title?: string; responsibilities?: string[] }>,
): ImpactExtractionResult {
  const allBullets = experience.flatMap(e => e.responsibilities || []).filter(Boolean);
  return extractImpactMetrics(allBullets);
}
