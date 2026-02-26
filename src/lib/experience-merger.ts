/**
 * experience-merger.ts
 *
 * Pure-function library for computing TRUE experience duration from a
 * candidate's structured JSONB experience array.
 *
 * Problem it solves:
 *   The existing engine uses `years_of_experience` (self-reported) OR
 *   falls back to `new Date().getFullYear() - Math.min(...startYears)` which
 *   is CAREER SPAN (includes education/gaps/overlapping jobs) — not actual
 *   worked time.  Candidates intentionally or accidentally inflate this.
 *
 * Our approach:
 *   1. Parse each role's start/end date into a {year, month} interval.
 *   2. Merge overlapping/adjacent intervals (sweep-line algorithm).
 *   3. Sum the merged interval lengths — this is actual worked months.
 *   4. Optionally exclude internships.
 *
 * Assumptions documented:
 *   • Date strings accepted: YYYY, YYYY-MM, YYYY-MM-DD, "present"/"current"
 *   • If only YYYY is present, we assume month = January (start) or December (end)
 *     for conservative estimation (does NOT over-credit).
 *   • If end_date is null/undefined/present/current → treated as NOW.
 *   • Roles with start_date only and is_current=false → treated as 0-month span
 *     (we cannot guess duration; confidence penalised).
 *   • Internship detection: title contains "intern", "internship", "co-op", "coop".
 *     Excluded from TOTAL but kept in a separate internship_months field.
 *   • Defensive clamp: single role capped at 40 years; total capped at 50 years.
 *   • This module has NO external dependencies — pure TS, unit-testable.
 */

// ── Types ────────────────────────────────────────────────────────────────────

/** A half-open month interval [startMonth, endMonth) in absolute months since year 0.
 *  absoluteMonth(year, month1Based) = year * 12 + (month1Based - 1)
 */
interface MonthInterval {
    /** Inclusive start month index (year * 12 + (month-1), 1-based month) */
    start: number;
    /** Exclusive end month index */
    end: number;
    /** Original role title (for internship detection) */
    title: string;
    /** Role was parseable */
    parseable: boolean;
}

export interface ExperienceResult {
    /** Total worked months EXCLUDING internships */
    total_months: number;
    /** Rounded to 1 decimal (total_months / 12) */
    total_years: number;
    /** Months from internship roles (excluded from total) */
    internship_months: number;
    /** Number of non-overlapping intervals after merging */
    merged_interval_count: number;
    /** 0–1 confidence: 1.0 = all dates parseable, 0.6 = partial, 0.3 = none */
    confidence: number;
    /** How many raw roles had unparseable dates */
    unparseable_count: number;
    /** Raw input role count */
    raw_role_count: number;
}

// Raw shape of one element in candidates.experience JSONB
// Loose typing — we defensively handle every field variant seen in production data.
interface RawRole {
    title?: string;
    company?: string;
    start_date?: string | null;
    end_date?: string | null;
    current?: boolean | null;
    // Some parsers emit these instead:
    startDate?: string | null;
    endDate?: string | null;
    isCurrent?: boolean | null;
}

// ── Constants ────────────────────────────────────────────────────────────────

/** A single role absolutely cannot span more than this many years (defensive) */
const MAX_ROLE_YEARS = 40;
/** Total career cannot exceed this (defensive against bad data) */
const MAX_CAREER_YEARS = 50;

/** Month index for "now" — recalculated per call so tests can mock Date */
function nowMonthIndex(): number {
    const now = new Date();
    return now.getFullYear() * 12 + now.getMonth(); // getMonth() is 0-based = already (month-1)
}

/** Regex patterns for internship title detection */
const INTERN_PATTERN = /\b(intern(ship)?|co[-\s]?op|cooperative\s+education)\b/i;

// ── Date parsing ─────────────────────────────────────────────────────────────

/**
 * Parse a date string → absolute month index.
 * Returns null if the string is unparseable.
 *
 * Accepted formats (case-insensitive):
 *   YYYY             → Jan of that year (for start) — see isStart param
 *   YYYY-MM          → that month
 *   YYYY-MM-DD       → that month
 *   "present"        → NOW (see treatCurrentAsNow)
 *   "current"        → NOW
 *   "now"            → NOW
 *   Various human formats: "Jan 2020", "January 2020", "2020 Jan"
 *
 * @param raw          Raw date string from JSONB
 * @param isStart      If true and only YYYY given, use January (conservative start)
 *                     If false and only YYYY given, use December (conservative end)
 */
export function parseDateToMonthIndex(raw: string | null | undefined, isStart: boolean): number | null {
    if (!raw) return null;
    const str = String(raw).trim().toLowerCase();

    // Present / current keywords
    if (/^(present|current|now|ongoing|today)$/i.test(str)) {
        return nowMonthIndex();
    }

    // YYYY-MM-DD or YYYY-MM
    const ymd = str.match(/^(\d{4})[-/](\d{1,2})(?:[-/]\d{1,2})?$/);
    if (ymd) {
        const year = parseInt(ymd[1], 10);
        const month = parseInt(ymd[2], 10); // 1-based
        if (year < 1950 || year > 2040 || month < 1 || month > 12) return null;
        return year * 12 + (month - 1);
    }

    // YYYY only
    const yearOnly = str.match(/^(\d{4})$/);
    if (yearOnly) {
        const year = parseInt(yearOnly[1], 10);
        if (year < 1950 || year > 2040) return null;
        // For start dates: January (month index 0) — conservative (doesn't over-credit)
        // For end dates: December (month index 11) — conservative (doesn't under-credit)
        return year * 12 + (isStart ? 0 : 11);
    }

    // "Jan 2020", "January 2020", "2020 Jan", "2020 January"
    const MONTH_NAMES: Record<string, number> = {
        jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
        jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
        january: 0, february: 1, march: 2, april: 3, june: 5,
        july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
    };

    const monthYear = str.match(/^([a-z]+)[,.\s]+(\d{4})$/) || str.match(/^(\d{4})[,.\s]+([a-z]+)$/);
    if (monthYear) {
        const p1 = monthYear[1], p2 = monthYear[2];
        const yearStr = /^\d{4}$/.test(p1) ? p1 : p2;
        const monthStr = /^\d{4}$/.test(p1) ? p2 : p1;
        const year = parseInt(yearStr, 10);
        const month = MONTH_NAMES[monthStr.toLowerCase()];
        if (!isNaN(year) && month !== undefined && year >= 1950 && year <= 2040) {
            return year * 12 + month;
        }
    }

    return null; // unparseable
}

// ── Interval building ─────────────────────────────────────────────────────────

/**
 * Normalise a raw role into a MonthInterval.
 * Returns null if the role has no usable start date.
 */
export function buildInterval(role: RawRole): MonthInterval | null {
    // Normalise field names (some parsers use camelCase)
    const startRaw = role.start_date ?? role.startDate ?? null;
    const endRaw = role.end_date ?? role.endDate ?? null;
    const isCurrent = !!(role.current ?? role.isCurrent ?? false);
    const title = (role.title || '').trim();

    const startIdx = parseDateToMonthIndex(startRaw, true);
    if (startIdx === null) {
        return { start: 0, end: 0, title, parseable: false };
    }

    let endIdx: number;
    if (isCurrent || !endRaw) {
        endIdx = nowMonthIndex() + 1; // +1 for exclusive endpoint
    } else {
        const parsed = parseDateToMonthIndex(endRaw, false);
        if (parsed === null) {
            // Has start but no parseable end and not current:
            // We cannot infer duration — treat as 0-length and mark unparseable.
            return { start: startIdx, end: startIdx, title, parseable: false };
        }
        endIdx = parsed + 1; // +1 for exclusive endpoint
    }

    // Defensive: end must be after start
    if (endIdx <= startIdx) endIdx = startIdx + 1; // minimum 1 month

    // Defensive clamp: single role cap
    const maxEnd = startIdx + MAX_ROLE_YEARS * 12;
    if (endIdx > maxEnd) endIdx = maxEnd;

    return { start: startIdx, end: endIdx, title, parseable: true };
}

// ── Merge algorithm ───────────────────────────────────────────────────────────

/**
 * Merge overlapping or adjacent month intervals.
 * Standard sweep-line / interval-union algorithm:
 *   1. Sort by start
 *   2. Iterate; extend current tail if next interval overlaps or is adjacent
 *
 * Time complexity: O(n log n) for the sort, O(n) for the sweep.
 */
export function mergeIntervals(intervals: Array<{ start: number; end: number }>): Array<{ start: number; end: number }> {
    if (intervals.length === 0) return [];
    const sorted = [...intervals].sort((a, b) => a.start - b.start);
    const merged: Array<{ start: number; end: number }> = [{ ...sorted[0] }];

    for (let i = 1; i < sorted.length; i++) {
        const last = merged[merged.length - 1];
        const curr = sorted[i];
        if (curr.start <= last.end) {
            // Overlapping or adjacent (curr.start <= last.end means they share at least a boundary)
            last.end = Math.max(last.end, curr.end);
        } else {
            merged.push({ ...curr });
        }
    }
    return merged;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Compute true worked experience from a candidate's experience JSONB array.
 *
 * @param experienceJson   The raw value from candidates.experience (any shape)
 * @param excludeInternships  Default true — OPT profile may set false
 * @returns ExperienceResult with total_months, total_years, confidence, etc.
 */
export function computeExperienceDuration(
    experienceJson: unknown,
    excludeInternships = true,
): ExperienceResult {
    // Normalise to array
    let roles: RawRole[] = [];
    if (Array.isArray(experienceJson)) {
        roles = experienceJson as RawRole[];
    } else if (typeof experienceJson === 'string') {
        try { roles = JSON.parse(experienceJson); } catch { roles = []; }
    }

    if (roles.length === 0) {
        return {
            total_months: 0,
            total_years: 0,
            internship_months: 0,
            merged_interval_count: 0,
            confidence: 0.3,
            unparseable_count: 0,
            raw_role_count: 0,
        };
    }

    const intervals: MonthInterval[] = roles
        .map(r => buildInterval(r))
        .filter((iv): iv is MonthInterval => iv !== null);

    const parseableCount = intervals.filter(iv => iv.parseable).length;
    const unparseableCount = intervals.filter(iv => !iv.parseable).length;

    // Split into internship vs. substantive roles
    const substantiveIntervals = intervals.filter(iv => iv.parseable && !(excludeInternships && INTERN_PATTERN.test(iv.title)));
    const internshipIntervals = intervals.filter(iv => iv.parseable && excludeInternships && INTERN_PATTERN.test(iv.title));

    // Merge separately
    const mergedSubstantive = mergeIntervals(substantiveIntervals);
    const mergedInternship = mergeIntervals(internshipIntervals);

    const sumMonths = (ivs: Array<{ start: number; end: number }>) =>
        ivs.reduce((acc, iv) => acc + (iv.end - iv.start), 0);

    const rawTotal = sumMonths(mergedSubstantive);
    const internshipMonths = sumMonths(mergedInternship);

    // Defensive total cap
    const total_months = Math.min(rawTotal, MAX_CAREER_YEARS * 12);
    const total_years = Math.round((total_months / 12) * 10) / 10;

    // Confidence computation:
    //   1.0 = all roles have parseable start + end dates
    //   0.6 = some roles have parseable dates (> 0 but < all)
    //   0.3 = no roles have parseable dates at all
    const confidence =
        parseableCount === 0 ? 0.3 :
            parseableCount < roles.length ? 0.6 :
                1.0;

    return {
        total_months,
        total_years,
        internship_months: internshipMonths,
        merged_interval_count: mergedSubstantive.length,
        confidence,
        unparseable_count: unparseableCount,
        raw_role_count: roles.length,
    };
}

/**
 * Convenience: returns only the total_years + confidence for use in scoring.
 * Matches the contract expected by the patched scoreExperience().
 */
export function getComputedYears(
    experienceJson: unknown,
    excludeInternships = true,
): { years: number; confidence: number; evidence: ExperienceResult } {
    const result = computeExperienceDuration(experienceJson, excludeInternships);
    return {
        years: result.total_years,
        confidence: result.confidence,
        evidence: result,
    };
}
