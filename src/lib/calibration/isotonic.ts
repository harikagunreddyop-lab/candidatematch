/**
 * calibration/isotonic.ts
 *
 * Isotonic regression for score → P(interview) calibration.
 *
 * Problem: A raw ATS score of 65 means nothing without knowing how often
 * candidates with score=65 actually get interviews.  This module:
 *   1. Reads historical ats_events with outcomes
 *   2. Bins scores into 5-point buckets (0, 5, 10, ... 100)
 *   3. Fits a monotonic probability curve using Pool Adjacent Violators (PAV)
 *   4. Stores the curve in calibration_curves table
 *   5. Provides a fast runtime lookup: score → p_interview
 *
 * Why isotonic regression (vs. logistic)?
 *   Logistic assumes a parametric S-curve.  Our score distribution may not
 *   fit that shape (e.g., scores might cluster around 60–80 for biased reasons).
 *   Isotonic regression is non-parametric and only enforces monotonicity —
 *   higher score MUST mean higher or equal interview probability.
 *
 * Minimum data requirement:
 *   At least 30 outcome-labeled events total per profile before the curve is used.
 *   Below this threshold, lookupCalibration() returns null.
 *
 * Usage:
 *   // Offline (admin route or cron):
 *   await rebuildCalibrationCurves(supabase, ['A', 'C']);
 *
 *   // Runtime (per scoring call):
 *   const cal = await lookupCalibration(supabase, profile, score, jobFamily);
 *   if (cal) breakdown.p_interview = cal.p_interview;
 */

import { error as logError } from '@/lib/logger';
import type { ScoringProfile } from '@/lib/policy-engine';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CalibrationBin {
    bucket: number;     // 0, 5, 10, ... 100
    p: number;          // 0–1 monotonic interview probability
    n: number;          // sample count in this bucket
    outcomes: number;   // interview/offer/hired count in this bucket
}

export interface CalibrationResult {
    p_interview: number;
    bucket: number;
    sample_count: number;
    ci_lower: number;   // 95% Wilson confidence interval lower bound
    ci_upper: number;   // 95% Wilson confidence interval upper bound
    reliable: boolean;  // true if sample_count >= min_reliable_samples
}

interface OutcomeEvent {
    ats_score: number;
    outcome: string;
}

// ── Pool Adjacent Violators (PAV) ─────────────────────────────────────────────

/**
 * Enforce isotonicity (non-decreasing) on an array of {bucket, p, n} objects.
 * Uses the standard PAV algorithm: merge violating adjacent pairs by
 * weighted average until no violation remains.
 *
 * Time complexity: O(k²) where k = number of distinct buckets (21 at most).
 */
export function poolAdjacentViolators(bins: CalibrationBin[]): CalibrationBin[] {
    if (bins.length <= 1) return bins;

    // Work on a mutable copy
    const result: CalibrationBin[] = bins.map(b => ({ ...b }));

    let changed = true;
    while (changed) {
        changed = false;
        for (let i = 0; i < result.length - 1; i++) {
            if (result[i].p > result[i + 1].p) {
                // Violation: merge i and i+1 into i with weighted-average p
                const totalN = result[i].n + result[i + 1].n;
                const totalOutcomes = result[i].outcomes + result[i + 1].outcomes;
                const mergedP = totalN > 0 ? totalOutcomes / totalN : 0;

                result[i] = {
                    bucket: result[i].bucket,  // keep the lower bucket label
                    p: mergedP,
                    n: totalN,
                    outcomes: totalOutcomes,
                };

                result.splice(i + 1, 1); // remove the merged bucket
                changed = true;
                break; // restart scan after merge
            }
        }
    }

    return result;
}

// ── Wilson confidence interval ────────────────────────────────────────────────

/**
 * Compute 95% Wilson score confidence interval for a proportion.
 * More accurate than normal approximation for small samples.
 *
 * @param k  Number of successes
 * @param n  Total trials
 */
export function wilsonCI(k: number, n: number): [number, number] {
    if (n === 0) return [0, 1];
    const z = 1.96; // 95% CI
    const p = k / n;
    const denom = 1 + (z * z) / n;
    const center = (p + (z * z) / (2 * n)) / denom;
    const margin = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
    return [Math.max(0, center - margin), Math.min(1, center + margin)];
}

// ── Calibration rebuild ───────────────────────────────────────────────────────

const OUTCOME_POSITIVE = new Set(['interview', 'offer', 'hired']); // events that count as "got interview"
const BUCKET_STEP = 5;
const MIN_RELIABLE_SAMPLES = 30;

function snapToBucket(score: number): number {
    return Math.round(score / BUCKET_STEP) * BUCKET_STEP;
}

/**
 * Rebuild calibration curves from historical ats_events data.
 * Run this weekly or after every 100 new outcome events.
 *
 * @param supabase       Service-role client
 * @param profiles       Which profiles to rebuild (default: both)
 * @param jobFamilies    Which job families to build cluster-specific curves for.
 *                       Pass [] to only build global curves.
 */
export async function rebuildCalibrationCurves(
    supabase: any,
    profiles: ScoringProfile[] = ['A', 'C'],
    jobFamilies: string[] = [],
): Promise<{ rebuilt: number; errors: string[] }> {
    let rebuilt = 0;
    const errors: string[] = [];

    for (const profile of profiles) {
        // Include global (null job_family) + each specific family
        const families: (string | null)[] = [null, ...jobFamilies];

        for (const jobFamily of families) {
            try {
                await rebuildOneCalibration(supabase, profile, jobFamily ?? null);
                rebuilt++;
            } catch (err: any) {
                const msg = `[calibration] rebuild failed: profile=${profile} family=${jobFamily}: ${err?.message}`;
                logError(msg, err);
                errors.push(msg);
            }
        }
    }

    return { rebuilt, errors };
}

async function rebuildOneCalibration(
    supabase: any,
    profile: ScoringProfile,
    jobFamily: string | null,
): Promise<void> {
    // Pull all scored events with known outcomes for this profile.
    // We read payload->>'ats_score' and payload->>'scoring_profile' from JSONB.
    let query = supabase
        .from('ats_events')
        .select('payload')
        .in('event_type', ['ats_score_computed'])
        .not('payload->outcome', 'is', null);

    const { data: rawEvents, error } = await query;
    if (error) throw new Error(error.message);
    if (!rawEvents?.length) return;

    // Filter by profile and extract score + outcome
    const events: OutcomeEvent[] = rawEvents
        .map((row: any) => row.payload)
        .filter((p: any) =>
            (p?.scoring_profile ?? 'A') === profile &&
            p?.ats_score != null &&
            p?.outcome != null &&
            (!jobFamily || p?.job_family === jobFamily)
        )
        .map((p: any) => ({ ats_score: Number(p.ats_score), outcome: String(p.outcome) }));

    if (events.length === 0) return;

    // Bin into 5-point buckets
    const bucketMap = new Map<number, { n: number; outcomes: number }>();
    for (let b = 0; b <= 100; b += BUCKET_STEP) bucketMap.set(b, { n: 0, outcomes: 0 });

    for (const evt of events) {
        const bucket = snapToBucket(Math.max(0, Math.min(100, evt.ats_score)));
        const entry = bucketMap.get(bucket)!;
        entry.n++;
        if (OUTCOME_POSITIVE.has(evt.outcome)) entry.outcomes++;
    }

    // Build initial bins array (non-empty buckets only to avoid PAV artifacts)
    const rawBins: CalibrationBin[] = [];
    for (const [bucket, { n, outcomes }] of Array.from(bucketMap.entries())) {
        if (n > 0) {
            rawBins.push({ bucket, p: outcomes / n, n, outcomes });
        }
    }
    rawBins.sort((a, b) => a.bucket - b.bucket);

    // Apply PAV to enforce monotonicity
    const isotonicBins = poolAdjacentViolators(rawBins);

    // Upsert into calibration_curves
    await supabase.from('calibration_curves').upsert([{
        profile,
        job_family: jobFamily ?? null,
        sample_count: events.length,
        outcome_count: events.filter(e => OUTCOME_POSITIVE.has(e.outcome)).length,
        bins: isotonicBins,
        min_reliable_samples: MIN_RELIABLE_SAMPLES,
    }], { onConflict: 'profile,job_family' });
}

// ── Runtime lookup ────────────────────────────────────────────────────────────

// In-process cache of calibration curves (reloaded per serverless invocation)
const _curveCache = new Map<string, CalibrationBin[]>();

/**
 * Look up the calibrated interview probability for a given score.
 * Returns null if:
 *   - No curve exists for this profile + family
 *   - Sample count < min_reliable_samples
 *   - Any error occurs
 */
export async function lookupCalibration(
    supabase: any,
    profile: ScoringProfile,
    atsScore: number,
    jobFamily: string | null = null,
): Promise<CalibrationResult | null> {
    const curveKey = `${profile}:${jobFamily ?? '_global'}`;

    let bins = _curveCache.get(curveKey);

    if (!bins) {
        // Try cluster-specific first, fall back to global
        const { data: curveRow } = await supabase
            .from('calibration_curves')
            .select('bins, sample_count, min_reliable_samples')
            .eq('profile', profile)
            .or(`job_family.eq.${jobFamily ?? 'null'},job_family.is.null`)
            .order('job_family', { ascending: false, nullsLast: true }) // prefer specific over global
            .limit(1)
            .maybeSingle();

        if (!curveRow || curveRow.sample_count < curveRow.min_reliable_samples) {
            return null; // Not enough data
        }

        bins = curveRow.bins as CalibrationBin[];
        _curveCache.set(curveKey, bins);
    }

    if (!bins || bins.length === 0) return null;

    const bucket = snapToBucket(Math.max(0, Math.min(100, atsScore)));

    // Find the bin for this bucket, or interpolate from nearest
    let bin = bins.find(b => b.bucket === bucket);
    if (!bin) {
        // Nearest-neighbour interpolation (simple, robust)
        const sorted = [...bins].sort((a, b) => Math.abs(a.bucket - bucket) - Math.abs(b.bucket - bucket));
        bin = sorted[0];
    }

    const [ci_lower, ci_upper] = wilsonCI(bin.outcomes, bin.n);

    return {
        p_interview: bin.p,
        bucket: bin.bucket,
        sample_count: bin.n,
        ci_lower,
        ci_upper,
        reliable: bin.n >= MIN_RELIABLE_SAMPLES,
    };
}
