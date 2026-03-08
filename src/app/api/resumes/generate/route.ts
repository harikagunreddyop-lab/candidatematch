import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireApiAuth, canAccessCandidate } from '@/lib/api-auth';
import { hasFeature } from '@/lib/feature-flags-server';
import { rateLimitResponse } from '@/lib/rate-limit';
import { isValidUuid } from '@/lib/security';
import { checkDailyLimit } from '@/lib/usage-limits';

export const dynamic = 'force-dynamic';
export const maxDuration = 35;

const RESUME_WORKER_URL =
  process.env.RESUME_WORKER_URL?.trim() && !process.env.RESUME_WORKER_URL.includes(':3000')
    ? process.env.RESUME_WORKER_URL
    : 'http://127.0.0.1:3001';
const REDIS_URL = process.env.REDIS_URL || null;
const WORKER_SECRET = process.env.WORKER_SECRET || '';
const QUEUE_WAIT_MS = 30000;

/**
 * POST /api/resumes/generate — Queue resume generation and wait for completion (max 30s).
 * Uses BullMQ when REDIS_URL is set; otherwise calls worker HTTP and waits.
 * Returns: resumeUrl, atsScore, duration, optimizations.
 */
export async function POST(req: NextRequest) {
  try {
    const authResult = await requireApiAuth(req, { roles: ['admin', 'recruiter', 'candidate'] });
    if (authResult instanceof Response) return authResult;

    const rl = await rateLimitResponse(req, 'api', authResult.user.id);
    if (rl) return rl;

    if (authResult.profile.role === 'candidate') {
      const supabase = createServiceClient();
      const usage = await checkDailyLimit(supabase, authResult.user.id, 'resume_generated', 'daily_resume_gen_limit');
      if (!usage.allowed) {
        return NextResponse.json(
          { error: usage.errorMessage, limit: usage.limit, used: usage.used, reset_at: usage.reset_at },
          { status: 429 },
        );
      }
    }

    let body: { candidate_id?: string; job_id?: string; templateType?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const { candidate_id, job_id, templateType = 'techElite' } = body || {};
    if (!candidate_id || !job_id) {
      return NextResponse.json({ error: 'candidate_id and job_id required' }, { status: 400 });
    }
    if (!isValidUuid(candidate_id) || !isValidUuid(job_id)) {
      return NextResponse.json({ error: 'Invalid candidate_id or job_id' }, { status: 400 });
    }

    const supabase = createServiceClient();

    if (authResult.profile.role === 'recruiter') {
      const ok = await canAccessCandidate(authResult, candidate_id, supabase);
      if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    } else if (authResult.profile.role === 'candidate') {
      const { data: c } = await supabase
        .from('candidates')
        .select('id')
        .eq('id', candidate_id)
        .eq('user_id', authResult.user.id)
        .single();
      if (!c) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (authResult.profile.role === 'recruiter') {
      const fromFlags = await hasFeature(supabase, authResult.profile.id, 'recruiter', 'resume_generation_allowed', false);
      const { data: profile } = await supabase.from('profiles').select('resume_generation_allowed').eq('id', authResult.profile.id).single();
      if (!fromFlags && profile?.resume_generation_allowed !== true) {
        return NextResponse.json({ error: 'Resume generation is not enabled for your account.' }, { status: 403 });
      }
    } else if (authResult.profile.role === 'candidate') {
      const tailor = await hasFeature(supabase, authResult.profile.id, 'candidate', 'candidate_tailor_resume', true);
      if (!tailor) {
        return NextResponse.json({ error: 'Resume tailoring is not enabled for your account.' }, { status: 403 });
      }
    }

    const [{ data: candidate, error: cErr }, { data: job, error: jErr }] = await Promise.all([
      supabase.from('candidates').select('*').eq('id', candidate_id).single(),
      supabase.from('jobs').select('*').eq('id', job_id).single(),
    ]);
    if (cErr || !candidate) return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
    if (jErr || !job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

    const { count: versionCount } = await supabase
      .from('resume_versions')
      .select('id', { count: 'exact', head: true })
      .eq('candidate_id', candidate_id)
      .eq('job_id', job_id);
    const versionNumber = (versionCount || 0) + 1;
    const filePath = `generated/${candidate_id}/${job_id}/v${versionNumber}.docx`;

    const { data: resumeVersion, error: rvErr } = await supabase
      .from('resume_versions')
      .insert({
        candidate_id,
        job_id,
        pdf_path: filePath,
        generation_status: 'pending',
        version_number: versionNumber,
        bullets: [],
      })
      .select()
      .single();

    if (rvErr || !resumeVersion) {
      return NextResponse.json({ error: 'Failed to create resume version: ' + rvErr?.message }, { status: 500 });
    }

    const payload = {
      resume_version_id: resumeVersion.id,
      candidate,
      job,
      file_path: filePath,
      templateType,
    };

    type WorkerResult = { resume_version_id: string; duration?: number; atsScore?: number; cached?: boolean; resumeUrl?: string; storagePath?: string };
    let result: WorkerResult;

    if (REDIS_URL) {
      try {
        const IORedis = (await import('ioredis')).default;
        const { Queue, QueueEvents } = await import('bullmq');
        const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
        const queueName = 'resume-generation';
        const queue = new Queue(queueName, { connection: connection as import('bullmq').ConnectionOptions });
        const queueEvents = new QueueEvents(queueName, { connection: connection as import('bullmq').ConnectionOptions });
        const jobId = `gen-${resumeVersion.id}-${Date.now()}`;
        const job = await queue.add('generate', payload, { jobId, removeOnComplete: { count: 100 } });
        result = await job.waitUntilFinished(queueEvents, QUEUE_WAIT_MS);
        await queue.close();
        await queueEvents.close();
        connection.disconnect();
      } catch (queueErr: unknown) {
        const msg = queueErr instanceof Error ? queueErr.message : 'Queue failed';
        await supabase.from('resume_versions').update({ generation_status: 'failed', error_message: msg }).eq('id', resumeVersion.id);
        return NextResponse.json({ error: 'Resume queue failed. Try again or use async tailor.', detail: msg }, { status: 503 });
      }
    } else {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), QUEUE_WAIT_MS);
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (WORKER_SECRET) headers['X-Worker-Secret'] = WORKER_SECRET;
      const res = await fetch(`${RESUME_WORKER_URL}/generate`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) {
        const errText = await res.text();
        await supabase.from('resume_versions').update({ generation_status: 'failed', error_message: errText }).eq('id', resumeVersion.id);
        return NextResponse.json({ error: 'Resume generation failed', detail: errText }, { status: res.status === 408 ? 408 : 502 });
      }
      result = (await res.json()) as WorkerResult;
    }

    return NextResponse.json({
      resume_version_id: result.resume_version_id,
      resumeUrl: result.resumeUrl ?? result.storagePath ?? filePath,
      atsScore: result.atsScore ?? 95,
      duration: result.duration,
      cached: result.cached,
      optimizations: (result.atsScore ?? 0) >= 90 ? ['ats-optimized', 'keyword-density'] : [],
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[resumes/generate]', message);
    return NextResponse.json(
      { error: 'Resume generation failed', detail: process.env.NODE_ENV === 'development' ? message : undefined },
      { status: 500 },
    );
  }
}
