/**
 * GET /api/company/candidates/[candidateId]/notes — List notes on a candidate (company-scoped).
 * POST /api/company/candidates/[candidateId]/notes — Add note (with optional mentioned_users).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireApiAuth } from '@/lib/api-auth';
import { canAccessCandidate } from '@/lib/api-auth';
import { handleAPIError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> }
) {
  try {
    const authResult = await requireApiAuth(req, { effectiveRoles: ['platform_admin', 'company_admin', 'recruiter'] });
    if (authResult instanceof NextResponse) return authResult;
    const companyId = authResult.profile.company_id;
    if (!companyId)
      return NextResponse.json({ error: 'No company context' }, { status: 403 });

    const { candidateId } = await params;
    if (!candidateId) return NextResponse.json({ error: 'candidateId required' }, { status: 400 });

    const supabase = createServiceClient();
    const ok = await canAccessCandidate(authResult, candidateId, supabase);
    if (!ok) return NextResponse.json({ error: 'Cannot access this candidate' }, { status: 403 });

    const { data, error } = await supabase
      .from('candidate_notes')
      .select('*, author:profiles!author_id(id, name, email)')
      .eq('candidate_id', candidateId)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const notes = (data ?? []).filter(
      (n: { is_private: boolean; author_id: string | null }) =>
        !n.is_private || n.author_id === authResult.profile.id
    );
    return NextResponse.json({ notes });
  } catch (e) {
    return handleAPIError(e);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> }
) {
  try {
    const authResult = await requireApiAuth(req, { effectiveRoles: ['platform_admin', 'company_admin', 'recruiter'] });
    if (authResult instanceof NextResponse) return authResult;
    const companyId = authResult.profile.company_id;
    const profileId = authResult.profile.id;
    if (!companyId)
      return NextResponse.json({ error: 'No company context' }, { status: 403 });

    const { candidateId } = await params;
    if (!candidateId) return NextResponse.json({ error: 'candidateId required' }, { status: 400 });

    const supabase = createServiceClient();
    const ok = await canAccessCandidate(authResult, candidateId, supabase);
    if (!ok) return NextResponse.json({ error: 'Cannot access this candidate' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { note_text, note_type, is_private, mentioned_users } = body;
    if (!note_text || typeof note_text !== 'string' || !note_text.trim())
      return NextResponse.json({ error: 'note_text required' }, { status: 400 });

    const { data, error } = await supabase
      .from('candidate_notes')
      .insert({
        candidate_id: candidateId,
        author_id: profileId,
        company_id: companyId,
        note_text: note_text.trim(),
        note_type: note_type ?? null,
        is_private: !!is_private,
        mentioned_users: Array.isArray(mentioned_users) ? mentioned_users : [],
      })
      .select('*, author:profiles!author_id(id, name, email)')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  } catch (e) {
    return handleAPIError(e);
  }
}
