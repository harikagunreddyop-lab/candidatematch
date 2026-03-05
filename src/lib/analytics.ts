/**
 * Client-side product analytics helper.
 *
 * Usage:
 *   import { trackEvent } from '@/lib/analytics';
 *   trackEvent('job_viewed', { job_id: '...' });
 *
 * Rules:
 *   - Fire-and-forget: never throws, never awaited.
 *   - Events are batched over a 300ms window before sending.
 *   - Works only in browser (SSR safe — no-ops on the server).
 *   - Requires an active Supabase session (Authorization header is set
 *     automatically by the Supabase client SDK on client components).
 */

type EventType =
    | 'job_viewed'
    | 'ats_checked'
    | 'resume_generated'
    | 'apply_clicked'
    | 'autofill_used'
    | 'application_status_changed';

interface PendingEvent {
    event_type: EventType;
    metadata: Record<string, unknown>;
}

let pending: PendingEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

const FLUSH_DELAY_MS = 300;
const MAX_BATCH_SIZE = 20;

function flush(): void {
    if (pending.length === 0) return;
    const batch = pending.splice(0, MAX_BATCH_SIZE);
    flushTimer = null;

    // Best-effort: fire-and-forget
    fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: batch }),
        keepalive: true,
    }).catch(() => {
        // Silently discard analytics failures — never impact UX
    });
}

/**
 * Track a product analytics event. Safe to call anywhere in client components.
 * No-ops silently on the server.
 */
export function trackEvent(
    eventType: EventType,
    metadata: Record<string, unknown> = {},
): void {
    // Guard: SSR
    if (typeof window === 'undefined') return;

    pending.push({ event_type: eventType, metadata });

    // Debounce flush
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(flush, FLUSH_DELAY_MS);

    // If we've hit the max batch size, flush immediately
    if (pending.length >= MAX_BATCH_SIZE) {
        if (flushTimer) clearTimeout(flushTimer);
        flush();
    }
}
