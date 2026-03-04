// Lightweight, client-safe title compatibility helper used in dashboards.
// Intentionally mirrors the server-side QA/Analyst gating behavior without
// pulling in any Node-only dependencies.

function tokenize(title: string): string[] {
  return String(title || '')
    .toLowerCase()
    .split(/[^a-z0-9+]+/g)
    .filter(Boolean);
}

function isQaLike(title: string): boolean {
  const t = String(title || '').toLowerCase();
  if (!t) return false;
  return (
    /\bqa\b/.test(t) ||
    /quality\s*assur/.test(t) ||
    /\bquality\s*engineer/.test(t) ||
    /\btest(ing)?\s*(eng|engineer|lead|manager|analyst)\b/.test(t) ||
    /\bsdet\b/.test(t) ||
    /automation\s*(tester|engineer|qa)/.test(t) ||
    /\bsoftware\s*tester\b/.test(t)
  );
}

function isAnalystLike(title: string): boolean {
  return /\banalyst\b/i.test(title || '');
}

const TRIVIAL_TOKENS = new Set([
  'senior',
  'jr',
  'junior',
  'lead',
  'staff',
  'principal',
  'manager',
  'associate',
  'specialist',
  'consultant',
  'director',
  'head',
  'vp',
  'engineer',
  'developer',
  'analyst',
  'intern',
  'internship',
  'contractor',
]);

const DOMAIN_KEYWORD_GROUPS: string[][] = [
  // QA / testing
  ['qa', 'quality', 'testing', 'tester', 'sdet', 'automation'],
  // Compliance / audit / risk
  ['compliance', 'audit', 'regulatory', 'policy'],
  ['risk', 'fraud', 'credit'],
  // Data / analytics
  ['data', 'analytics', 'analytical', 'bi', 'insight'],
  // Marketing / growth
  ['marketing', 'growth', 'performance'],
  // Finance
  ['finance', 'financial', 'fp&a', 'investment'],
  // Security
  ['security', 'cyber', 'infosec'],
];

function hasSharedDomainKeyword(candidateTitles: string[], jobTitle: string): boolean {
  const jobTokens = new Set(tokenize(jobTitle));
  const candTokens = new Set<string>();
  for (const ct of candidateTitles) {
    for (const tok of tokenize(ct)) {
      candTokens.add(tok);
    }
  }

  for (const group of DOMAIN_KEYWORD_GROUPS) {
    let inJob = false;
    let inCand = false;
    for (const kw of group) {
      const norm = kw.toLowerCase();
      if (jobTokens.has(norm)) inJob = true;
      if (candTokens.has(norm)) inCand = true;
    }
    if (inJob && inCand) return true;
  }
  return false;
}

/**
 * Client-side guard to hide obviously irrelevant matches from candidate and
 * recruiter/admin dashboards.
 *
 * Rules:
 * - If the candidate looks QA/test and the job title does NOT, hide match.
 * - For overloaded "Analyst" titles (candidate or job), require at least one
 *   shared domain keyword between candidate titles and job title, otherwise
 *   hide (e.g. QA Analyst ↔ Compliance Analyst, Data Analyst ↔ Financial Analyst).
 * - When we have no usable titles, do not gate (return true).
 */
export function isTitleClearlyCompatibleForUi(
  candidate: { primary_title?: string | null; target_roles?: string[] | null },
  jobTitle: string | null | undefined,
): boolean {
  const job = (jobTitle || '').trim();
  const candidateTitles = [
    candidate.primary_title || '',
    ...(candidate.target_roles || []),
  ]
    .map(t => t || '')
    .filter(t => t.trim().length > 0);

  // No titles → let other signals (ATS, skills) decide; don't silently drop.
  if (!candidateTitles.length || !job) return true;

  const jobIsQa = isQaLike(job);
  const candIsQa = candidateTitles.some(t => isQaLike(t));

  // QA/QC specialization — QA candidates should not see generic/non-QA analyst roles.
  if (candIsQa && !jobIsQa) {
    return false;
  }

  const jobIsAnalyst = isAnalystLike(job);
  const candIsAnalyst = candidateTitles.some(t => isAnalystLike(t));

  // Overloaded "Analyst" titles — require a shared domain keyword.
  if ((jobIsAnalyst || candIsAnalyst) && !candIsQa && !jobIsQa) {
    if (!hasSharedDomainKeyword(candidateTitles, job)) {
      return false;
    }
  }

  return true;
}

