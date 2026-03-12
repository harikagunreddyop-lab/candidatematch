/**
 * Scoring utilities: candidate–job match score.
 * Re-exports match scoring only; ATS score logic has been moved.
 */
export { calculateMatchScore } from '@/lib/job-match-score';
export type { CandidateForMatch, JobForMatch } from '@/lib/job-match-score';

// TODO: ATS scoring replaced — rewire to new engine at src/lib/ats/
