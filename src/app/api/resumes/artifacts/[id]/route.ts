/**
 * GET /api/resumes/artifacts/[id] — Poll artifact status + download URLs
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET(
    req: NextRequest,
    { params }: { params: { id: string } },
) {
    const authResult = await requireApiAuth(req, { effectiveRoles: ['platform_admin', 'company_admin', 'recruiter', 'candidate'] });
    if (authResult instanceof Response) return authResult;

    const supabase = createServiceClient();
    const { data: artifact, error } = await supabase
        .from('resume_artifacts')
        .select('id, candidate_id, job_id, template_id, status, docx_url, pdf_url, coverage_json, error_json, created_at, updated_at')
        .eq('id', params.id)
        .single();

    if (error || !artifact) {
        return NextResponse.json({ error: 'Artifact not found' }, { status: 404 });
    }

    // Generate download URLs if ready
    let downloadUrl: string | null = null;
    if (artifact.status === 'ready' && artifact.docx_url) {
        const { data: signed } = await supabase.storage
            .from('resumes')
            .createSignedUrl(artifact.docx_url, 3600); // 1 hour
        downloadUrl = signed?.signedUrl || null;
    }

    return NextResponse.json({
        ...artifact,
        download_url: downloadUrl,
    });
}
