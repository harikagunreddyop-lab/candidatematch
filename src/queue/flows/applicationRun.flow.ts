/**
 * Application Run Flow — orchestrates the queue-first pipeline.
 *
 * Intent → Match → Score → Tailor → Complete
 */
import { createServiceClient } from '@/lib/supabase-server';
import { matchQueue, type MatchJobData } from '../queues';

export interface RunIntent {
    targetRoles?: string[];
    locations?: string[];
    remote?: boolean;
    visaStatus?: string;
    salaryMin?: number;
    salaryMax?: number;
    seniority?: string;
    maxJobs?: number; // cap how many jobs to process per run
}

/**
 * Creates an application run and enqueues the first step (match).
 * Returns the run ID immediately — all processing happens async.
 */
export async function startApplicationRun(
    candidateId: string,
    intent: RunIntent,
): Promise<{ runId: string }> {
    const supabase = createServiceClient();

    // 1. Insert application_runs row
    const { data: run, error: runErr } = await supabase
        .from('application_runs')
        .insert({
            candidate_id: candidateId,
            status: 'queued',
            intent,
            metrics: { jobs_seen: 0, matches: 0, scored: 0, tailored: 0, applied: 0 },
        })
        .select('id')
        .single();

    if (runErr || !run) {
        throw new Error(`Failed to create run: ${runErr?.message || 'unknown'}`);
    }

    // 2. Insert run_steps (all start as pending)
    const steps = ['match', 'score', 'tailor'] as const;
    const stepRows = steps.map((step) => ({
        run_id: run.id,
        step,
        status: 'pending' as const,
    }));

    const { data: insertedSteps, error: stepErr } = await supabase
        .from('run_steps')
        .insert(stepRows)
        .select('id, step');

    if (stepErr || !insertedSteps) {
        throw new Error(`Failed to create run steps: ${stepErr?.message || 'unknown'}`);
    }

    const matchStep = insertedSteps.find((s: { step: string; id: string }) => s.step === 'match');
    if (!matchStep) throw new Error('Match step not created');

    // 3. Enqueue match job
    const jobData: MatchJobData = {
        runId: run.id,
        stepId: matchStep.id,
        candidateId,
        intent: intent as Record<string, unknown>,
    };

    await matchQueue.add('match-job', jobData, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
    });

    // 4. Update run status to running
    await supabase
        .from('application_runs')
        .update({ status: 'running', updated_at: new Date().toISOString() })
        .eq('id', run.id);

    return { runId: run.id };
}

/**
 * Retrieves the full status of a run including all steps and metrics.
 */
export async function getRunStatus(runId: string) {
    const supabase = createServiceClient();

    const [runRes, stepsRes] = await Promise.all([
        supabase.from('application_runs').select('*').eq('id', runId).single(),
        supabase.from('run_steps').select('*').eq('run_id', runId).order('step'),
    ]);

    if (runRes.error || !runRes.data) {
        return null;
    }

    return {
        ...runRes.data,
        steps: stepsRes.data || [],
    };
}
