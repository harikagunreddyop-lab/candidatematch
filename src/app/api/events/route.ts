import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';
import { rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const ALLOWED_EVENT_TYPES = new Set([
    'job_viewed',
    'ats_checked',
    'resume_generated',
    'apply_clicked',
    'autofill_used',
    'application_status_changed',
]);

const MAX_EVENTS_PER_REQUEST = 20;

/**
 * POST /api/events
 * Body: { events: [{ event_type: string, metadata: object }] }
 *
 * Batch-inserts product analytics events. user_id is always set server-side
 * from the authenticated session — never trusted from the client payload.
 */
export async function POST(req: NextRequest) {
    const auth = await requireApiAuth(req, { roles: ['admin', 'recruiter', 'candidate'] });
    if (auth instanceof Response) return auth;

    const rl = rateLimitResponse(req, 'api', auth.user.id);
    if (rl) return rl;

    let body: { events?: unknown[] };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    if (!Array.isArray(body?.events) || body.events.length === 0) {
        return NextResponse.json({ error: 'events array required' }, { status: 400 });
    }

    // Validate and sanitize each event
    const rows: { user_id: string; event_type: string; metadata: Record<string, unknown> }[] = [];
    for (const raw of body.events.slice(0, MAX_EVENTS_PER_REQUEST)) {
        if (!raw || typeof raw !== 'object') continue;
        const ev = raw as Record<string, unknown>;
        const eventType = String(ev.event_type || '').trim();
        if (!ALLOWED_EVENT_TYPES.has(eventType)) continue;
        const metadata = (ev.metadata && typeof ev.metadata === 'object' && !Array.isArray(ev.metadata))
            ? ev.metadata as Record<string, unknown>
            : {};
        rows.push({ user_id: auth.user.id, event_type: eventType, metadata });
    }

    if (rows.length === 0) {
        return NextResponse.json({ error: 'No valid events in request' }, { status: 400 });
    }

    // Use service client so writes bypass RLS (INSERT policy requires auth.uid(),
    // which works for anon-key client but service-role is more reliable in API routes)
    const supabase = createServiceClient();
    const { error } = await supabase.from('events').insert(rows);
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ saved: rows.length });
}
