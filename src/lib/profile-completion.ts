/**
 * Profile completion and strength calculation (shared between dashboard stats and profile page).
 */

export const PROFILE_FIELDS_WEIGHT: { key: string; weight: number }[] = [
  { key: 'full_name', weight: 10 },
  { key: 'email', weight: 10 },
  { key: 'primary_title', weight: 15 },
  { key: 'summary', weight: 15 },
  { key: 'skills', weight: 15 },
  { key: 'experience', weight: 20 },
  { key: 'education', weight: 10 },
  { key: 'location', weight: 5 },
];

export function profileCompletionPercent(candidate: Record<string, unknown> | null): number {
  if (!candidate) return 0;
  let total = 0;
  let filled = 0;
  for (const { key, weight } of PROFILE_FIELDS_WEIGHT) {
    total += weight;
    const v = candidate[key];
    if (Array.isArray(v)) filled += v.length > 0 ? weight : 0;
    else if (v != null && String(v).trim() !== '') filled += weight;
  }
  return total === 0 ? 0 : Math.round((filled / total) * 100);
}

/**
 * Heuristic profile strength 0-100. Can be overridden by DB profile_strength_score when set.
 */
export function profileStrengthScore(candidate: Record<string, unknown> | null): number {
  if (!candidate) return 0;
  const completion = profileCompletionPercent(candidate);
  const skills = candidate.skills as unknown[] | undefined;
  const experience = candidate.experience as unknown[] | undefined;
  const summary = (candidate.summary as string) || '';
  const skillsScore = Math.min(15, (skills?.length ?? 0) * 2);
  const experienceScore = Math.min(15, (experience?.length ?? 0) * 5);
  const summaryScore = summary.length >= 100 ? 10 : summary.length >= 50 ? 5 : 0;
  const total = completion * 0.6 + skillsScore + experienceScore + summaryScore;
  return Math.min(100, Math.round(total));
}

export interface ProfileCompletionItem {
  key: string;
  label: string;
  filled: boolean;
  weight: number;
}

export function profileCompletionChecklist(candidate: Record<string, unknown> | null): ProfileCompletionItem[] {
  if (!candidate) return [];
  return PROFILE_FIELDS_WEIGHT.map(({ key, weight }) => {
    const v = candidate[key];
    const filled = Array.isArray(v) ? v.length > 0 : v != null && String(v).trim() !== '';
    const label = key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    return { key, label, filled, weight };
  });
}
