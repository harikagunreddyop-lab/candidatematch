import { NextRequest, NextResponse } from 'next/server';
import { authedCandidateClient } from '../_auth';

export const dynamic = 'force-dynamic';

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: CORS });
}

// Rate limit: max 100 fill events per user per hour
const RATE_LIMIT = 100;

export async function POST(req: NextRequest) {
    const auth = await authedCandidateClient(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });

    let body: any;
    try { body = await req.json(); } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers: CORS });
    }

    const {
        domain, ats_type = 'unknown', page_url,
        detected_fields = 0, filled_fields = 0, low_confidence_fields = 0,
        corrections_count = 0, payload = {},
    } = body ?? {};

    if (!domain || !page_url) {
        return NextResponse.json({ error: 'domain and page_url required' }, { status: 400, headers: CORS });
    }

    // Rate limit check
    const oneHourAgo = new Date(Date.now() - 3_600_000).toISOString();
    const { count } = await auth.supabase
        .from('application_fill_events')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', auth.user.id)
        .gte('created_at', oneHourAgo);

    if ((count ?? 0) >= RATE_LIMIT) {
        return NextResponse.json({ error: 'Rate limit: max 100 fill events per hour' }, { status: 429, headers: CORS });
    }

    const time_saved_seconds = Math.round(Number(filled_fields) * 6); // heuristic: 6s per field

    const { error } = await auth.supabase
        .from('application_fill_events')
        .insert({
            user_id: auth.user.id,
            domain: String(domain).slice(0, 253),
            ats_type: String(ats_type).slice(0, 64),
            page_url: String(page_url).slice(0, 2048),
            detected_fields: Math.max(0, Number(detected_fields)),
            filled_fields: Math.max(0, Number(filled_fields)),
            low_confidence_fields: Math.max(0, Number(low_confidence_fields)),
            time_saved_seconds,
            corrections_count: Math.max(0, Number(corrections_count)),
            payload: typeof payload === 'object' ? payload : {},
        });

    if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: CORS });
    return NextResponse.json({ ok: true, time_saved_seconds }, { headers: CORS });
}
