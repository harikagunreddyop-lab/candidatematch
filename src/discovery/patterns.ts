// Provider detection patterns and source_org extraction.

export type Provider = 'greenhouse' | 'lever' | 'ashby';

export interface DetectedBoard {
  provider: Provider;
  source_org: string;
}

const GH_BOARD_REGEX = /boards\.greenhouse\.io\/([a-zA-Z0-9_-]+)/g;
const GH_API_REGEX = /boards-api\.greenhouse\.io\/v1\/boards\/([a-zA-Z0-9_-]+)/g;

const LEVER_BOARD_REGEX = /jobs\.lever\.co\/([a-zA-Z0-9_.-]+)/g;
const LEVER_API_REGEX = /api\.lever\.co\/v0\/postings\/([a-zA-Z0-9_.-]+)/g;

const ASHBY_REGEX = /ashbyhq\.com\/posting-api\/job-board\/([a-zA-Z0-9_.-]+)/g;

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

export function detectBoards(html: string): DetectedBoard[] {
  if (!html) return [];
  const results: DetectedBoard[] = [];

  const ghTokens: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = GH_BOARD_REGEX.exec(html)) !== null) ghTokens.push(m[1]);
  while ((m = GH_API_REGEX.exec(html)) !== null) ghTokens.push(m[1]);
  for (const t of uniq(ghTokens)) {
    results.push({ provider: 'greenhouse', source_org: t });
  }

  const leverTokens: string[] = [];
  while ((m = LEVER_BOARD_REGEX.exec(html)) !== null) leverTokens.push(m[1]);
  while ((m = LEVER_API_REGEX.exec(html)) !== null) leverTokens.push(m[1]);
  for (const t of uniq(leverTokens)) {
    results.push({ provider: 'lever', source_org: t });
  }

  const ashbyTokens: string[] = [];
  while ((m = ASHBY_REGEX.exec(html)) !== null) ashbyTokens.push(m[1]);
  for (const t of uniq(ashbyTokens)) {
    results.push({ provider: 'ashby', source_org: t });
  }

  return results;
}

