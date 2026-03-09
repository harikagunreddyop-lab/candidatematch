/**
 * GET /api/runs/[id] — Get run status + steps + metrics (for UI polling)
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { getRunStatus } from '@/queue/flows/applicationRun.flow';

export const dynamic = 'force-dynamic';

export async function GET(
    req: NextRequest,
    { params }: { params: { id: string } },
) {
    const authResult = await requireApiAuth(req, { effectiveRoles: ['platform_admin', 'company_admin', 'recruiter', 'candidate'] });
    if (authResult instanceof Response) return authResult;

    try {
        const run = await getRunStatus(params.id);
        if (!run) {
            return NextResponse.json({ error: 'Run not found' }, { status: 404 });
        }
        return NextResponse.json(run);
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
