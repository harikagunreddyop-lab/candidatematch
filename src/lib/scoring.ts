/**
 * Scoring utilities: candidate–job match score and ATS-friendly resume score.
 * Re-exports match scoring and provides a simple ATS formatting score.
 */
import { calculateGenericAtsScore } from '@/lib/resume-ats-score';

export { calculateMatchScore } from '@/lib/job-match-score';
export type { CandidateForMatch, JobForMatch } from '@/lib/job-match-score';

export interface ResumeForAtsScore {
  text: string;
  formatting?: {
    has_complex_tables?: boolean;
    uses_images?: boolean;
  };
}

/**
 * Compute 0–100 ATS-friendly score for a resume (formatting + content).
 * Penalizes complex tables and images; uses generic ATS breakdown for text quality.
 */
export function calculateATSScore(resume: ResumeForAtsScore): number {
  const result = calculateGenericAtsScore(resume.text);
  let score = result.score;
  const fmt = resume.formatting ?? {};
  if (fmt.has_complex_tables) score = Math.max(0, score - 15);
  if (fmt.uses_images) score = Math.max(0, score - 20);
  return Math.min(100, Math.round(score));
}
