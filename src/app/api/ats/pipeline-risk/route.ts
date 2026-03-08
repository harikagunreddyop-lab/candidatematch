/**
 * POST /api/ats/pipeline-risk
 * Elite Part 3 — Pipeline risk detection
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireRecruiterOrAdmin, canAccessCandidate } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';
import { detectPipelineRisks } from '@/lib/ai';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = await requireRecruiterOrAdmin(req);
  if (auth instanceof Response) return auth;

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'AI service unavailable' }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const candidateId = String(body.candidate_id || '');

  if (!candidateId) {
    return NextResponse.json({ error: 'candidate_id required' }, { status: 400 });
  }

  const service = createServiceClient();
  if (auth.profile.role === 'recruiter') {
    const ok = await canAccessCandidate(auth, candidateId, service);
    if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: candidate } = await service.from('candidates').select('full_name').eq('id', candidateId).single();
  const { data: apps } = await service
    .from('applications')
    .select('id, status, applied_at, updated_at, job:jobs(title, company)')
    .eq('candidate_id', candidateId)
    .order('updated_at', { ascending: false });

  const now = new Date();
  const snapshots = (apps || []).map((a: any) => {
    const updated = a.updated_at ? new Date(a.updated_at) : now;
    const days = Math.floor((now.getTime() - updated.getTime()) / 86400000);
    return {
      id: a.id,
      job_title: (a.job as any)?.title || 'Unknown',
      company: (a.job as any)?.company || 'Unknown',
      status: a.status,
      applied_at: a.applied_at,
      updated_at: a.updated_at,
      days_since_update: days,
    };
  });

  const result = await detectPipelineRisks(snapshots, candidate?.full_name);

  if (!result) return NextResponse.json({ error: 'AI analysis failed' }, { status: 502 });
  return NextResponse.json(result);
}
