/**
 * Daily usage limit enforcement.
 *
 * Reads per-user daily limits from app_settings and counts today's
 * usage from the events table. Intended for cost protection:
 *   - ATS checks (expensive Claude API calls)
 *   - Resume generation (expensive worker calls)
 *
 * Usage:
 *   const check = await checkDailyLimit(supabase, userId, 'ats_checked', 'daily_ats_check_limit');
 *   if (!check.allowed) return NextResponse.json({ error: check.errorMessage }, { status: 429 });
 */

/** Default limits if not configured in app_settings */
const DEFAULTS: Record<string, number> = {
    daily_ats_check_limit: 10,
    daily_resume_gen_limit: 3,
};

export interface UsageLimitResult {
    allowed: boolean;
    used: number;
    limit: number;
    /** ISO timestamp when the limit resets (midnight UTC) */
    reset_at: string;
    /** Pre-formatted error message suitable for API response */
    errorMessage: string;
}

/**
 * Check whether a user has exceeded their daily usage limit.
 *
 * @param supabase      Service-role Supabase client
 * @param userId        User's UUID (from profiles.id)
 * @param eventType     The event_type counted in the events table
 * @param settingsKey   The app_settings key holding the numeric limit
 */
export async function checkDailyLimit(
    supabase: { from: (table: string) => any },
    userId: string,
    eventType: string,
    settingsKey: string,
): Promise<UsageLimitResult> {
    // Midnight UTC — start of the current day
    const now = new Date();
    const todayUtc = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    ).toISOString();

    // Midnight UTC — start of tomorrow (reset point)
    const tomorrowUtc = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
    ).toISOString();

    // 1. Read limit from app_settings (fallback to hard-coded default)
    let limit = DEFAULTS[settingsKey] ?? 10;
    try {
        const { data: setting } = await supabase
            .from('app_settings')
            .select('value')
            .eq('key', settingsKey)
            .maybeSingle();
        if (setting?.value != null) {
            const parsed = typeof setting.value === 'number'
                ? setting.value
                : Number(String(setting.value).replace(/"/g, ''));
            if (Number.isFinite(parsed) && parsed > 0) limit = parsed;
        }
    } catch {
        // Fallback to default — never fail hard
    }

    // 2. Count today's usage from events table
    let used = 0;
    try {
        const { count } = await supabase
            .from('events')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('event_type', eventType)
            .gte('created_at', todayUtc);
        used = count ?? 0;
    } catch {
        // If events table isn't populated yet (new deploy), allow the call
        return {
            allowed: true,
            used: 0,
            limit,
            reset_at: tomorrowUtc,
            errorMessage: '',
        };
    }

    const allowed = used < limit;
    return {
        allowed,
        used,
        limit,
        reset_at: tomorrowUtc,
        errorMessage: allowed
            ? ''
            : `Daily limit reached: ${used}/${limit} ${eventType.replace(/_/g, ' ')} today. Resets at midnight UTC.`,
    };
}

/** Free tier: max job matches a candidate can see per week (UTC week) */
export const FREE_TIER_WEEKLY_MATCH_LIMIT = 10;

/** Start of current week (Monday 00:00 UTC) */
function getWeekStartUtc(now: Date): string {
    const d = new Date(now);
    const day = d.getUTCDay();
    const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
    d.setUTCDate(diff);
    d.setUTCHours(0, 0, 0, 0);
    return d.toISOString();
}

/** Next Monday 00:00 UTC (for limit reset display) */
export function getWeeklyMatchResetAt(): string {
    const d = new Date();
    const day = d.getUTCDay();
    const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
    d.setUTCDate(diff + 7);
    d.setUTCHours(0, 0, 0, 0);
    return d.toISOString();
}

/**
 * Count how many candidate_job_matches the candidate has in the current week (by matched_at).
 * Used to enforce free-tier "10 matches per week" limit.
 */
export async function getWeeklyMatchCount(
    supabase: { from: (table: string) => any },
    candidateId: string,
): Promise<number> {
    const weekStart = getWeekStartUtc(new Date());
    const { count } = await supabase
        .from('candidate_job_matches')
        .select('id', { count: 'exact', head: true })
        .eq('candidate_id', candidateId)
        .gte('matched_at', weekStart);
    return count ?? 0;
}
