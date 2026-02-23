/**
 * ATS (Applicant Tracking System) score tiers for matching.
 * Used across matching engine, UI, and apply API for consistency.
 */

/** Score 82+: allowed to apply with no caution */
export const SCORE_APPLY_OK = 82;
/** Score 75–82: allowed to apply with caution */
export const SCORE_APPLY_CAUTION = 75;
/** Minimum score to store as a match (below this we don't show as match) */
export const SCORE_MIN_STORED = 50;

export type ScoreTier = 'ok' | 'caution' | 'blocked';

export function getScoreTier(score: number): ScoreTier {
  if (score >= SCORE_APPLY_OK) return 'ok';
  if (score >= SCORE_APPLY_CAUTION) return 'caution';
  return 'blocked';
}

/** Whether the candidate is allowed to apply (score >= 75) */
export function canApply(score: number): boolean {
  return typeof score === 'number' && score >= SCORE_APPLY_CAUTION;
}

/** Human-readable label for the tier (for badges/tooltips) */
export function getScoreLabel(score: number): string {
  const tier = getScoreTier(score);
  if (tier === 'ok') return 'Strong match — apply';
  if (tier === 'caution') return 'Moderate match — apply with caution';
  return 'Below threshold — cannot apply';
}

/** Tailwind-style color classes for score badge (bg/text) */
export function getScoreBadgeClasses(score: number): { bg: string; text: string } {
  const tier = getScoreTier(score);
  if (tier === 'ok') return { bg: 'bg-emerald-500/15 ring-emerald-500/20', text: 'text-emerald-700 dark:text-emerald-300' };
  if (tier === 'caution') return { bg: 'bg-amber-500/15 ring-amber-500/20', text: 'text-amber-700 dark:text-amber-300' };
  return { bg: 'bg-red-500/15 ring-red-500/20', text: 'text-red-600 dark:text-red-300' };
}
