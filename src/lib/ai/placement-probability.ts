/**
 * Placement Probability Engine — Elite Part 4
 */

import { lookupCalibration } from '@/lib/calibration/isotonic';
import type { ScoringProfile } from '@/lib/policy-engine';

export interface PlacementProbability {
  p_interview: number;
  p_offer_estimate: number;
  expected_days_to_interview: number | null;
  reliable: boolean;
  narrative?: string;
}

export async function getPlacementProbability(
  supabase: { from: (t: string) => unknown },
  atsScore: number,
  jobFamily: string,
  scoringProfile: ScoringProfile = 'A'
): Promise<PlacementProbability> {
  const cal = await lookupCalibration(supabase as any, scoringProfile, atsScore, jobFamily || null);
  if (!cal) {
    return { p_interview: 0, p_offer_estimate: 0, expected_days_to_interview: null, reliable: false };
  }
  const pOffer = Math.min(0.5, cal.p_interview * 0.35);
  const expectedDays = cal.reliable ? 14 + (1 - cal.p_interview) * 14 : null;
  return {
    p_interview: cal.p_interview,
    p_offer_estimate: pOffer,
    expected_days_to_interview: expectedDays,
    reliable: cal.reliable,
  };
}
