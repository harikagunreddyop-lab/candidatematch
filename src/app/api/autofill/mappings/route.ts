import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const dynamic = 'force-dynamic';

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: CORS });
}

// ── auth helper ──────────────────────────────────────────────────────────────
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

// ── GET /api/autofill/mappings?domain=&ats= ──────────────────────────────────
export async function GET(req: NextRequest) {
    const auth = await authedClient(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });

    const domain = req.nextUrl.searchParams.get('domain') || '';
    const atsType = req.nextUrl.searchParams.get('ats') || 'unknown';

    if (!domain) return NextResponse.json({ error: 'domain required' }, { status: 400, headers: CORS });

    const { data, error } = await auth.supabase
        .from('application_field_mappings')
        .select('field_fingerprint, field_label, profile_key, confidence, use_count, field_meta')
        .eq('user_id', auth.user.id)
        .eq('domain', domain)
        .eq('ats_type', atsType)
        .order('use_count', { ascending: false })
        .limit(200);

    if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: CORS });
    return NextResponse.json({ mappings: data ?? [] }, { headers: CORS });
}

// ── POST /api/autofill/mappings ───────────────────────────────────────────────
// Payload: { domain, ats_type, mappings: [{ field_fingerprint, field_label, field_meta, profile_key, confidence }] }
export async function POST(req: NextRequest) {
    const auth = await authedClient(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });

    let body: any;
    try { body = await req.json(); } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers: CORS });
    }

    const { domain, ats_type = 'unknown', mappings } = body ?? {};
    if (!domain || !Array.isArray(mappings) || mappings.length === 0) {
        return NextResponse.json({ error: 'domain and mappings[] required' }, { status: 400, headers: CORS });
    }
    if (mappings.length > 100) {
        return NextResponse.json({ error: 'Max 100 mappings per request' }, { status: 400, headers: CORS });
    }

    // Build upsert rows
    const rows = mappings.map((m: any) => ({
        user_id: auth.user.id,
        domain,
        ats_type,
        field_fingerprint: String(m.field_fingerprint ?? '').slice(0, 128),
        field_label: m.field_label ? String(m.field_label).slice(0, 255) : null,
        field_meta: m.field_meta ?? {},
        profile_key: String(m.profile_key ?? '').slice(0, 128),
        // Confidence capped at 95 (humans can override up to 95; only system hits 100 never)
        confidence: Math.min(95, Math.max(0, Number(m.confidence ?? 50))),
        last_used_at: new Date().toISOString(),
        // use_count incremented via DB expression:
        // We use upsert + SQL expression for atomic increment
    }));

    // Supabase JS doesn't support "increment on conflict" natively;
    // use rpc or plain upsert + manual increment.
    // We'll do: fetch existing use_counts then upsert with incremented values.
    const fingerprints = rows.map(r => r.field_fingerprint);
    const { data: existing } = await auth.supabase
        .from('application_field_mappings')
        .select('field_fingerprint, use_count, confidence')
        .eq('user_id', auth.user.id)
        .eq('domain', domain)
        .eq('ats_type', ats_type)
        .in('field_fingerprint', fingerprints);

    const existingMap = new Map((existing ?? []).map((e: any) => [e.field_fingerprint, e]));

    const upsertRows = rows.map(r => {
        const prev = existingMap.get(r.field_fingerprint);
        return {
            ...r,
            use_count: (prev?.use_count ?? 0) + 1,
            // If a correction comes in (user manually assigned), boost confidence +10 capped at 95
            confidence: Math.min(95, prev ? Math.max(r.confidence, prev.confidence + 10) : r.confidence),
        };
    });

    const { error } = await auth.supabase
        .from('application_field_mappings')
        .upsert(upsertRows, { onConflict: 'user_id,domain,ats_type,field_fingerprint' });

    if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: CORS });
    return NextResponse.json({ saved: upsertRows.length }, { headers: CORS });
}
