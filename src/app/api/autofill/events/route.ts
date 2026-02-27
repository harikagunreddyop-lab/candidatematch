import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const dynamic = 'force-dynamic';

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: CORS });
}

async function authedClient(req: NextRequest) {
    const token = req.headers.get('authorization')?.replace('Bearer ', '').trim();
    if (!token) return null;
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return null;
    return { supabase, user };
}

// Rate limit: max 100 fill events per user per hour
const RATE_LIMIT = 100;

export async function POST(req: NextRequest) {
    const auth = await authedClient(req);
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
