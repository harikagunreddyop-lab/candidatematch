/**
 * telemetry.ts
 *
 * Server-side telemetry helper for writing to public.ats_events.
 *
 * Usage:
 *   import { emitEvent } from '@/lib/telemetry';
 *   await emitEvent(supabase, { event_type: 'ats_score_computed', candidate_id, job_id, payload: {...} });
 *
 * Design:
 *   • All writes are fire-and-forget safe: errors are logged but NEVER thrown.
 *     Telemetry must never break a production scoring path.
 *   • Structured payload allows per-event-type TypeScript types (see EventPayloadMap).
 *   • match_id is passed as UUID and cast to TEXT at insertion time.
 *   • Uses the service-role client (bypasses RLS INSERT policy on ats_events).
 */

import { error as logError } from '@/lib/logger';

// ── Payload shapes per event_type ─────────────────────────────────────────────

export interface AtsScoreComputedPayload {
    ats_score: number;
    ats_confidence: number | null;
    ats_confidence_bucket: string | null;
    ats_evidence_count: number | null;
    model_version: string;
    scoring_profile: 'A' | 'C';
    computation_ms: number | null;
    ai_tokens_used: number | null;
    // Shadow scoring fields (populated only when shadow mode is active)
    shadow_score?: number | null;
    shadow_confidence?: number | null;
    shadow_delta?: number | null;
}

export interface AtsGatePayload {
    ats_score: number;
    confidence_bucket: string;
    threshold_used: number;
    scoring_profile: 'A' | 'C';
    recommend_review?: boolean;
}

export interface OutcomePayload {
    outcome: 'interview' | 'offer' | 'hired' | 'rejected' | 'withdrawn';
    previous_status: string;
    ats_score_at_application?: number | null;
}

export interface CandidateYearsDiscrepancyPayload {
    profile_years: number;
    computed_years: number;
    delta: number;
    confidence: number;
}

export interface ShadowDeltaPayload {
    prod_score: number;
    shadow_score: number;
    delta: number;
    prod_version: string;
    shadow_version: string;
    scoring_profile: 'A' | 'C';
}

export interface OutreachPayload {
    sequence_id?: string;
    step_index: number;
    channel: 'email' | 'linkedin' | 'sms';
    target_type: 'candidate' | 'hiring_manager';
}

export interface GovernanceFlagPayload {
    flag_type: string;
    detail: string;
    affected_fields?: string[];
}

// Union of all payload types
export type EventPayloadMap = {
    ats_score_computed: AtsScoreComputedPayload;
    ats_gate_passed: AtsGatePayload;
    ats_gate_blocked: AtsGatePayload;
    ats_shadow_delta: ShadowDeltaPayload;
    outcome_interview: OutcomePayload;
    outcome_offer: OutcomePayload;
    outcome_hired: OutcomePayload;
    outcome_rejected: OutcomePayload;
    candidate_years_discrepancy: CandidateYearsDiscrepancyPayload;
    outreach_sent: OutreachPayload;
    outreach_replied: Record<string, unknown>;
    governance_flag: GovernanceFlagPayload;
};

// ── Event input shape ─────────────────────────────────────────────────────────

export interface EmitEventInput<T extends keyof EventPayloadMap = keyof EventPayloadMap> {
    event_type: T;
    event_source?: string;
    tenant_id?: string | null;
    candidate_id?: string | null;
    job_id?: string | null;
    /** Pass UUID string — will be stored as TEXT in ats_events.match_id */
    match_id?: string | null;
    application_id?: string | null;
    actor_user_id?: string | null;
    payload: EventPayloadMap[T];
}

// ── Main emitter ──────────────────────────────────────────────────────────────

/**
 * Fire-and-forget event write to ats_events.
 * NEVER throws — catches all errors internally.
 *
 * @param supabase  A service-role Supabase client (bypasses RLS)
 * @param event     Event data (see EmitEventInput)
 */
export async function emitEvent<T extends keyof EventPayloadMap>(
    supabase: { from: (table: string) => any },
    event: EmitEventInput<T>,
): Promise<void> {
    try {
        const row = {
            event_type: event.event_type,
            event_source: event.event_source ?? 'system',
            tenant_id: event.tenant_id ?? null,
            candidate_id: event.candidate_id ?? null,
            job_id: event.job_id ?? null,
            match_id: event.match_id ?? null, // TEXT column — UUID string is fine
            application_id: event.application_id ?? null,
            actor_user_id: event.actor_user_id ?? null,
            payload: event.payload,
        };

        const { error } = await supabase.from('ats_events').insert([row]);
        if (error) {
            logError('[telemetry] ats_events insert failed', error);
        }
    } catch (err) {
        // Telemetry MUST NOT bubble exceptions into the caller
        logError('[telemetry] emitEvent unexpected error', err);
    }
}

/**
 * Batch-emit multiple events in a single INSERT.
 * Use when scoring multiple candidate × job pairs in a cron run.
 */
export async function emitEvents(
    supabase: { from: (table: string) => any },
    events: EmitEventInput[],
): Promise<void> {
    if (events.length === 0) return;
    try {
        const rows = events.map(event => ({
            event_type: event.event_type,
            event_source: event.event_source ?? 'system',
            tenant_id: event.tenant_id ?? null,
            candidate_id: event.candidate_id ?? null,
            job_id: event.job_id ?? null,
            match_id: event.match_id ?? null,
            application_id: event.application_id ?? null,
            actor_user_id: event.actor_user_id ?? null,
            payload: event.payload,
        }));

        const { error } = await supabase.from('ats_events').insert(rows);
        if (error) logError('[telemetry] batch ats_events insert failed', error);
    } catch (err) {
        logError('[telemetry] emitEvents unexpected error', err);
    }
}

// ── Outcome recording helper ──────────────────────────────────────────────────

/**
 * Record an application outcome.
 * Called from the application status-update API route when status transitions to
 * 'interview', 'offer', 'hired', or 'rejected'.
 *
 * @param newStatus      The new status value
 * @param previousStatus The status before the transition
 */
export async function recordOutcome(
    supabase: { from: (table: string) => any },
    params: {
        candidateId: string;
        jobId: string;
        applicationId: string;
        newStatus: string;
        previousStatus: string;
        atsScoreAtApplication?: number | null;
        actorUserId?: string | null;
    },
): Promise<void> {
    const STATUS_TO_EVENT: Record<string, keyof EventPayloadMap> = {
        interview: 'outcome_interview',
        offer: 'outcome_offer',
        hired: 'outcome_hired',
        rejected: 'outcome_rejected',
    };

    const eventType = STATUS_TO_EVENT[params.newStatus];
    if (!eventType) return; // Only log terminal / milestone statuses

    await emitEvent(supabase, {
        event_type: eventType as 'outcome_interview' | 'outcome_offer' | 'outcome_hired' | 'outcome_rejected',
        candidate_id: params.candidateId,
        job_id: params.jobId,
        application_id: params.applicationId,
        actor_user_id: params.actorUserId ?? null,
        payload: {
            outcome: params.newStatus as any,
            previous_status: params.previousStatus,
            ats_score_at_application: params.atsScoreAtApplication ?? null,
        },
    });
}

// ── AI cost ledger helper ─────────────────────────────────────────────────────

/** Pricing lookup (USD per 1M tokens) — update when provider changes pricing */
const MODEL_PRICING: Record<string, { input_per_1m: number; output_per_1m: number }> = {
    'claude-haiku-4-5-20251001': { input_per_1m: 0.80, output_per_1m: 4.00 },
    'claude-sonnet-4-5-20250514': { input_per_1m: 3.00, output_per_1m: 15.00 },
    'claude-3-5-sonnet-20241022': { input_per_1m: 3.00, output_per_1m: 15.00 },
    'text-embedding-3-small': { input_per_1m: 0.02, output_per_1m: 0.00 },
    'text-embedding-3-large': { input_per_1m: 0.13, output_per_1m: 0.00 },
};

function computeCostUsd(model: string, inputTokens: number, outputTokens: number): number {
    const pricing = MODEL_PRICING[model];
    if (!pricing) return 0; // Unknown model — log $0, don't throw
    return (inputTokens / 1_000_000) * pricing.input_per_1m
        + (outputTokens / 1_000_000) * pricing.output_per_1m;
}

export interface AiCallLog {
    call_type: string;
    model: string;
    input_tokens: number;
    output_tokens: number;
    cache_hit?: boolean;
    duration_ms?: number | null;
    candidate_id?: string | null;
    job_id?: string | null;
    tenant_id?: string | null;
}

/**
 * Log an AI API call to ai_cost_ledger.
 * Fire-and-forget — never throws.
 */
export async function logAiCall(
    supabase: { from: (table: string) => any },
    log: AiCallLog,
): Promise<void> {
    try {
        const cost_usd = computeCostUsd(log.model, log.input_tokens, log.output_tokens);
        const { error } = await supabase.from('ai_cost_ledger').insert([{
            call_type: log.call_type,
            model: log.model,
            input_tokens: log.input_tokens,
            output_tokens: log.output_tokens,
            cost_usd,
            cache_hit: log.cache_hit ?? false,
            duration_ms: log.duration_ms ?? null,
            candidate_id: log.candidate_id ?? null,
            job_id: log.job_id ?? null,
            tenant_id: log.tenant_id ?? null,
        }]);
        if (error) logError('[telemetry] ai_cost_ledger insert failed', error);
    } catch (err) {
        logError('[telemetry] logAiCall unexpected error', err);
    }
}
