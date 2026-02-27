import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const dynamic = 'force-dynamic';

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
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

/**
 * GET /api/autofill/resumes
 * Returns metadata for the current user's uploaded resumes.
 * Extension uses this to show a "pick resume to attach" list.
 */
export async function GET(req: NextRequest) {
    const auth = await authedClient(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });

    // Resolve candidate_id from user_id
    const { data: candidate } = await auth.supabase
        .from('candidates')
        .select('id')
        .eq('user_id', auth.user.id)
        .single();

    if (!candidate) {
        return NextResponse.json({ resumes: [] }, { headers: CORS });
    }

    const { data, error } = await auth.supabase
        .from('candidate_resumes')
        .select('id, label, file_name, file_size, uploaded_at')
        .eq('candidate_id', candidate.id)
        .order('uploaded_at', { ascending: false })
        .limit(10);

    if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: CORS });

    // Attach a download endpoint hint (extension will POST to /api/autofill/resumes/download)
    const resumes = (data ?? []).map((r: any) => ({
        id: r.id,
        label: r.label || r.file_name,
        file_name: r.file_name,
        size_bytes: r.file_size,
        updated_at: r.uploaded_at,
    }));

    return NextResponse.json({ resumes }, { headers: CORS });
}
