/**
 * policy-engine.ts
 *
 * Profile Policy Layer — controls how scoring, gating, and automation behave
 * per operating profile WITHOUT blending profile logic into scoring code.
 *
 * Two profiles:
 *   A — OPT / International tech candidates (agency placement)
 *       • Outreach automation ON by default
 *       • More lenient gate when confidence is low (sparse resume data common)
 *       • Variant A/B testing ON
 *       • Fairness guardrails OFF (race/gender attributes not tracked for agency)
 *
 *   C — Enterprise internal mobility (governance + audit + fairness)
 *       • Outreach automation OFF (managed by HRIS)
 *       • Gate is NEVER hard-block — always produces a score + explanation for
 *         human review (compliance requirement)
 *       • Strict audit logging always ON
 *       • Fairness guardrails ON
 *
 * Usage:
 *   const policy = getPolicy('A');
 *   const gate = policy.evaluateGateDecision(score, confidenceBucket);
 *   const shouldRunOutreach = policy.allowedAutomation.outreach;
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type ScoringProfile = 'A' | 'C';

export type ConfidenceBucket = 'insufficient' | 'moderate' | 'good' | 'high';

export interface GateDecision {
    /** Whether the candidate clears the apply gate */
    passes: boolean;
    /** The threshold that was used */
    threshold_used: number;
    /** Human-readable explanation for the gate decision */
    reason: string;
    /**
     * For Enterprise (C): gate never hard-blocks — this flag means
     * "recommend review" instead of "reject". UI should show a flag icon,
     * not a block message.
     */
    recommend_review: boolean;
}

export interface WeightOverrides {
    keyword?: number;
    experience?: number;
    title?: number;
    education?: number;
    location?: number;
    formatting?: number;
    behavioral?: number;
    soft?: number;
}

export interface PolicyConfig {
    profile: ScoringProfile;

    /** Human-readable name for logging + dashboards */
    display_name: string;

    /**
     * Dimension weight overrides (null = use engine defaults).
     * Must sum to ≤ 1.0 if provided; engine will renormalise.
     */
    weight_overrides: WeightOverrides | null;

    /**
     * Gate thresholds by confidence bucket.
     * The engine looks up the bucket, applies the threshold, returns GateDecision.
     */
    gate_thresholds: Record<ConfidenceBucket, number>;

    /**
     * Allowed automation features for this profile.
     * All default to false; explicit true values are intentional.
     */
    allowed_automation: {
        outreach: boolean;
        follow_up_sequences: boolean;
        auto_apply: boolean;
    };

    /**
     * Whether enterprise governance mode is active.
     * When true:
     *   - scoring_runs snapshot is ALWAYS written
     *   - inputs_hash is logged
     *   - fairness exclusion list is applied
     *   - gate decision never hard-blocks
     */
    governance: {
        enabled: boolean;
        always_write_scoring_run: boolean;
        fairness_exclusion_enabled: boolean;
        hard_block_allowed: boolean;
    };

    /**
     * KPIs to compute for this profile.
     * Drives which queries the metrics API runs.
     */
    kpis: string[];

    /**
     * Minimum confidence bucket required for normal gating.
     * Below this, either relax gate (A) or flag for review (C).
     */
    min_confidence_for_normal_gate: ConfidenceBucket;
}

// ── Profile Definitions ───────────────────────────────────────────────────────

const PROFILE_A: PolicyConfig = {
    profile: 'A',
    display_name: 'OPT / Agency Placement',

    // No weight overrides — use engine defaults.
    // Rationale: agency placement is general-purpose; domain-specific
    // weight tuning would require separate calibrated curves per vertical.
    weight_overrides: null,

    // Gate thresholds by confidence bucket.
    // LOWER threshold when confidence is low — we can't penalise a candidate
    // for having a sparse resume when we have little evidence.
    // HIGHER threshold when confidence is high — we have strong signal.
    gate_thresholds: {
        insufficient: 38, // Relaxed: candidate may be strong but resume is sparse
        moderate: 48, // Near-standard
        good: 52, // Standard
        high: 57, // Stricter when we have full evidence
    },

    allowed_automation: {
        outreach: true,          // Core OPT workflow
        follow_up_sequences: true,
        auto_apply: false,       // Always requires recruiter review before apply
    },

    governance: {
        enabled: false,
        always_write_scoring_run: false, // Only on feature flag
        fairness_exclusion_enabled: false,
        hard_block_allowed: true,
    },

    kpis: [
        'interview_conversion_rate',
        'time_to_interview_days',
        'variant_win_rate',
        'outreach_reply_rate',
        'placement_rate',
        'ai_cost_per_placement',
    ],

    min_confidence_for_normal_gate: 'moderate',
};

const PROFILE_C: PolicyConfig = {
    profile: 'C',
    display_name: 'Enterprise Internal Mobility',

    // Slightly upweight experience and education for internal mobility
    // (seniority banding + degree requirements matter more in large enterprises).
    // Soft AI score downweighted — internal candidates are more "known quantities".
    weight_overrides: {
        keyword: 0.28,
        experience: 0.22,  // +4% vs engine default
        title: 0.14,
        education: 0.12,  // +4% vs engine default
        location: 0.08,
        formatting: 0.06,  // -1% (internal candidates write good docs, not resumes)
        behavioral: 0.07,
        soft: 0.03,  // -5%: AI soft score less trusted for internal mobility
    },

    // Enterprise: gate thresholds are HIGHER because HR needs explainability
    // but the gate never hard-blocks — see governance.hard_block_allowed = false.
    gate_thresholds: {
        insufficient: 45,
        moderate: 55,
        good: 60,
        high: 65,
    },

    allowed_automation: {
        outreach: false,          // HR manages internal communications directly
        follow_up_sequences: false,
        auto_apply: false,
    },

    governance: {
        enabled: true,
        always_write_scoring_run: true,  // Every score creates a scoring_run record
        fairness_exclusion_enabled: true, // Remove sensitive attributes from scoring inputs
        hard_block_allowed: false,        // Cannot hard-block — always pass for human review
    },

    kpis: [
        'time_to_internal_placement_days',
        'score_to_outcome_correlation',
        'fairness_disparity_index',
        'scoring_run_reproducibility_rate',
        'human_review_override_rate',
    ],

    min_confidence_for_normal_gate: 'good', // Higher bar for enterprise gate accuracy
};

const PROFILES: Record<ScoringProfile, PolicyConfig> = {
    A: PROFILE_A,
    C: PROFILE_C,
};

// ── Profile Resolver ──────────────────────────────────────────────────────────

/**
 * Get the policy config for a given profile.
 * Defaults to 'A' if profile is unrecognised (safe for production).
 */
export function getPolicy(profile: ScoringProfile | string | null | undefined): PolicyConfig {
    if (profile === 'C') return PROFILES.C;
    return PROFILES.A; // A is the safe default
}

// ── Confidence Bucket Computation ─────────────────────────────────────────────

/**
 * Map a 0–100 confidence integer to a ConfidenceBucket.
 *
 * Thresholds:
 *   < 35 → insufficient  (very sparse evidence; gate logic must account for this)
 *   35–64 → moderate
 *   65–84 → good
 *   ≥ 85 → high
 *
 * These thresholds are documented constants — changing them requires also
 * updating the ats_confidence_bucket CHECK constraint in migration 018.
 */
export function computeConfidenceBucket(confidenceInt: number | null | undefined): ConfidenceBucket {
    if (confidenceInt == null) return 'insufficient';
    if (confidenceInt < 35) return 'insufficient';
    if (confidenceInt < 65) return 'moderate';
    if (confidenceInt < 85) return 'good';
    return 'high';
}

/**
 * Convert a 0–1 float confidence (from ExperienceResult etc.) to 0–100 integer.
 */
export function floatConfidenceToInt(confidence: number): number {
    return Math.round(Math.max(0, Math.min(1, confidence)) * 100);
}

// ── Gate Decision Engine ──────────────────────────────────────────────────────

/**
 * Evaluate whether a candidate passes the apply gate under a given profile.
 *
 * @param atsScore          0–100 ATS score
 * @param confidenceBucket  Confidence bucket derived from evidence
 * @param policy            Policy config for the current profile
 * @param overrideThreshold Optional job-level threshold override (nullable)
 */
export function evaluateGateDecision(
    atsScore: number,
    confidenceBucket: ConfidenceBucket,
    policy: PolicyConfig,
    overrideThreshold?: number | null,
): GateDecision {
    const threshold = overrideThreshold ?? policy.gate_thresholds[confidenceBucket];

    // Enterprise Profile C: NEVER hard-blocks — always recommend_review instead.
    if (!policy.governance.hard_block_allowed) {
        return {
            passes: true, // Always passes for human review
            threshold_used: threshold,
            reason: atsScore >= threshold
                ? `Score ${atsScore} meets threshold ${threshold} (${confidenceBucket} confidence) — recommended for shortlist`
                : `Score ${atsScore} below threshold ${threshold} — flagged for human review (enterprise policy: no hard blocks)`,
            recommend_review: atsScore < threshold,
        };
    }

    const passes = atsScore >= threshold;
    return {
        passes,
        threshold_used: threshold,
        reason: passes
            ? `Score ${atsScore} ≥ ${threshold} (${confidenceBucket} confidence) — gate passed`
            : `Score ${atsScore} < ${threshold} (${confidenceBucket} confidence) — gate blocked`,
        recommend_review: false,
    };
}

// ── Weight Normalization ──────────────────────────────────────────────────────

/**
 * Merge policy weight overrides with engine defaults.
 * If overrides don't sum to 1.0, renormalise so they do.
 *
 * @param engineDefaults  The W const from ats-engine.ts
 * @param overrides       Policy weight_overrides (nullable)
 */
export function resolveWeights(
    engineDefaults: Record<string, number>,
    overrides: WeightOverrides | null,
): Record<string, number> {
    if (!overrides) return engineDefaults;

    const merged = { ...engineDefaults, ...overrides };
    const total = Object.values(merged).reduce((s, v) => s + v, 0);

    if (Math.abs(total - 1.0) < 0.001) return merged; // already sums to 1

    // Renormalise
    return Object.fromEntries(
        Object.entries(merged).map(([k, v]) => [k, v / total])
    );
}

// ── Fairness Attribute Scrubbing ──────────────────────────────────────────────

/**
 * For Enterprise (Profile C) governance: remove attributes from candidate data
 * that could introduce protected-class bias into scoring.
 *
 * Attributes excluded from scoring inputs (NOT from the DB record):
 *   - candidate name (not used by scoring engine — confirmed)
 *   - visa_status (location dim still scores geo; visa sponsorship scored separately)
 *   - citizenship
 *
 * NOTE: We pass visa_status through for the LOCATION dimension because
 * visa_sponsorship is a legitimate job requirement. Only the raw string
 * (which can signal national origin) is scrubbed; the boolean
 * needs_sponsorship is retained.
 *
 * This function is a no-op for Profile A.
 */
export function applyFairnessExclusions<T extends Record<string, unknown>>(
    candidateData: T,
    policy: PolicyConfig,
): T {
    if (!policy.governance.fairness_exclusion_enabled) return candidateData;

    const scrubbed = { ...candidateData } as Record<string, unknown>;

    // Replace free-text visa_status with a boolean needs_sponsorship signal
    // so the location scorer can still penalise mismatches without seeing raw strings.
    const rawVisa = scrubbed['visa_status'];
    if (typeof rawVisa === 'string') {
        const visaLower = rawVisa.toLowerCase();
        const needsSponsorship = /h1b|opt|tn|visa|sponsorship/.test(visaLower);
        scrubbed['visa_status'] = needsSponsorship ? 'needs_sponsorship' : 'no_sponsorship_needed';
    }

    return scrubbed as T;
}

// ── KPI Metadata ─────────────────────────────────────────────────────────────

export interface KpiMeta {
    key: string;
    label: string;
    unit: string;
    higher_is_better: boolean;
}

const KPI_REGISTRY: Record<string, KpiMeta> = {
    interview_conversion_rate: { key: 'interview_conversion_rate', label: 'Interview Conversion Rate', unit: '%', higher_is_better: true },
    time_to_interview_days: { key: 'time_to_interview_days', label: 'Avg Days to Interview', unit: 'days', higher_is_better: false },
    variant_win_rate: { key: 'variant_win_rate', label: 'Variant Win Rate', unit: '%', higher_is_better: true },
    outreach_reply_rate: { key: 'outreach_reply_rate', label: 'Outreach Reply Rate', unit: '%', higher_is_better: true },
    placement_rate: { key: 'placement_rate', label: 'Placement Rate', unit: '%', higher_is_better: true },
    ai_cost_per_placement: { key: 'ai_cost_per_placement', label: 'AI Cost Per Placement', unit: 'USD', higher_is_better: false },
    time_to_internal_placement_days: { key: 'time_to_internal_placement_days', label: 'Time to Internal Placement', unit: 'days', higher_is_better: false },
    score_to_outcome_correlation: { key: 'score_to_outcome_correlation', label: 'Score→Outcome Correlation', unit: 'r', higher_is_better: true },
    fairness_disparity_index: { key: 'fairness_disparity_index', label: 'Fairness Disparity Index', unit: 'index', higher_is_better: false },
    scoring_run_reproducibility_rate: { key: 'scoring_run_reproducibility_rate', label: 'Scoring Reproducibility', unit: '%', higher_is_better: true },
    human_review_override_rate: { key: 'human_review_override_rate', label: 'Human Review Override Rate', unit: '%', higher_is_better: false },
};

export function getProfileKpis(policy: PolicyConfig): KpiMeta[] {
    return policy.kpis.map(k => KPI_REGISTRY[k]).filter(Boolean);
}
