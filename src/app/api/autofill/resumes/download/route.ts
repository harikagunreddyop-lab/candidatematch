import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const BUCKET = 'resumes';
const SIGNED_URL_EXPIRY_SECONDS = 60; // short-lived — user must explicitly request

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

/**
 * POST /api/autofill/resumes/download
 * Body: { resume_id: string, confirmed: true }
 *
 * SAFETY: requires { confirmed: true } in body — extension must show user a
 * confirmation prompt before calling this endpoint.
 *
 * Returns a 60-second signed URL for the resume PDF.
 */
export async function POST(req: NextRequest) {
    const auth = await authedClient(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });

    let body: any;
    try { body = await req.json(); } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers: CORS });
    }

    // SAFETY GATE: extension must send confirmed: true
    if (body?.confirmed !== true) {
        return NextResponse.json(
            { error: 'User confirmation required. Send { confirmed: true } in body.' },
            { status: 400, headers: CORS }
        );
    }

    const { resume_id } = body ?? {};
    if (!resume_id) return NextResponse.json({ error: 'resume_id required' }, { status: 400, headers: CORS });

    // Verify the resume belongs to this user's candidate
    const { data: candidate } = await auth.supabase
        .from('candidates')
        .select('id')
        .eq('user_id', auth.user.id)
        .single();

    if (!candidate) return NextResponse.json({ error: 'No candidate profile' }, { status: 403, headers: CORS });

    const { data: resume, error: fetchErr } = await auth.supabase
        .from('candidate_resumes')
        .select('pdf_path, file_name')
        .eq('id', resume_id)
        .eq('candidate_id', candidate.id)
        .single();

    if (fetchErr || !resume) {
        return NextResponse.json({ error: 'Resume not found or not yours' }, { status: 404, headers: CORS });
    }

    const { data: signed, error: signErr } = await auth.supabase.storage
        .from(BUCKET)
        .createSignedUrl(resume.pdf_path, SIGNED_URL_EXPIRY_SECONDS);

    if (signErr || !signed?.signedUrl) {
        return NextResponse.json({ error: 'Could not generate download link' }, { status: 500, headers: CORS });
    }

    return NextResponse.json(
        { url: signed.signedUrl, file_name: resume.file_name, expires_in: SIGNED_URL_EXPIRY_SECONDS },
        { headers: CORS }
    );
}
