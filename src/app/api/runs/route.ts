/**
 * POST /api/runs — Start a new application run
 * GET  /api/runs — List runs for the authenticated user
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';
import { startApplicationRun, type RunIntent } from '@/queue/flows/applicationRun.flow';
import { rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    const authResult = await requireApiAuth(req, { effectiveRoles: ['platform_admin', 'company_admin', 'recruiter', 'candidate'] });
    if (authResult instanceof Response) return authResult;

    const rl = await rateLimitResponse(req, 'api', authResult.user.id);
    if (rl) return rl;

    try {
        const body = await req.json().catch(() => ({}));
        const { candidate_id, intent } = body as { candidate_id?: string; intent?: RunIntent };

        // Determine candidate ID
        let candidateId = candidate_id;

        if (!candidateId && authResult.profile?.role === 'candidate') {
            // Candidate creating their own run — look up their candidate record
            const supabase = createServiceClient();
            const { data: cand } = await supabase
                .from('candidates')
                .select('id')
                .eq('user_id', authResult.user.id)
                .single();
            candidateId = cand?.id;
        }

        if (!candidateId) {
            return NextResponse.json({ error: 'candidate_id is required' }, { status: 400 });
        }

        const result = await startApplicationRun(candidateId, intent || {});
        return NextResponse.json(result, { status: 201 });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function GET(req: NextRequest) {
    const authResult = await requireApiAuth(req, { effectiveRoles: ['platform_admin', 'company_admin', 'recruiter', 'candidate'] });
    if (authResult instanceof Response) return authResult;

    const supabase = createServiceClient();
    const role = authResult.profile?.role;
    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '20', 10);

    let query = supabase
        .from('application_runs')
        .select('id, candidate_id, status, intent, metrics, error_message, created_at, updated_at')
        .order('created_at', { ascending: false })
        .limit(Math.min(limit, 100));

    if (role === 'candidate') {
        // Candidates can only see their own runs
        const { data: cand } = await supabase
            .from('candidates')
            .select('id')
            .eq('user_id', authResult.user.id)
            .single();

        if (!cand) {
            return NextResponse.json({ runs: [] });
        }
        query = query.eq('candidate_id', cand.id);
    } else if (role === 'recruiter') {
        // Recruiters see runs for their assigned candidates
        const { data: assignments } = await supabase
            .from('recruiter_candidate_assignments')
            .select('candidate_id')
            .eq('recruiter_id', authResult.user.id);

        const candidateIds = (assignments || []).map((a: any) => a.candidate_id);
        if (!candidateIds.length) {
            return NextResponse.json({ runs: [] });
        }
        query = query.in('candidate_id', candidateIds);
    }
    // Admin sees all runs (no filter)

    const { data, error } = await query;
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ runs: data || [] });
}
