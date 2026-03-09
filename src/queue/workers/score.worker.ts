/**
 * Score Worker — ATS scoring for matched candidates.
 *
 * Consumes jobs from `scoreQueue`, runs ATS scoring on each match,
 * then enqueues tailor step for above-threshold matches.
 */
import { Worker } from 'bullmq';
import { getQueueConnection } from '../redis';
import { tailorQueue, type ScoreJobData, type TailorJobData } from '../queues';
import { createServiceClient } from '@/lib/supabase-server';
import { getAppUrl } from '@/config';

const SCORE_THRESHOLD = 65; // Minimum ATS score to proceed to tailoring

function createScoreWorker() {
    const queueConn = getQueueConnection();
    if (!queueConn) {
        throw new Error('Queue pipeline is not configured (REDIS_URL not set)');
    }
    const worker = new Worker<ScoreJobData>(
        'score',
        async (job) => {
            const { runId, stepId, candidateId, matchIds } = job.data;
            const supabase = createServiceClient();

            // Mark step as running
            await supabase.from('run_steps').update({
                status: 'running',
                started_at: new Date().toISOString(),
            }).eq('id', stepId);

            try {
                // Trigger ATS scoring via the existing batch endpoint logic
                // Score matches in batches to avoid timeouts
                const BATCH_SIZE = 10;
                let scored = 0;
                const aboveThreshold: string[] = [];

                for (let i = 0; i < matchIds.length; i += BATCH_SIZE) {
                    const batch = matchIds.slice(i, i + BATCH_SIZE);

                    // Fetch match details and existing scores in one query
                    const { data: matches } = await supabase
                        .from('candidate_job_matches')
                        .select('id, candidate_id, job_id, ats_score')
                        .in('id', batch);

                    if (!matches?.length) continue;

                    // Pre-map existing scores to avoid N+1
                    const existingScores = new Map<string, number | null>(matches.map((m: { id: string; ats_score: number | null }) => [m.id, m.ats_score]));

                    // For each match, trigger ATS check when not already scored
                    for (const match of matches) {
                        try {
                            const existingScore = existingScores.get(match.id);

                            // Skip if already scored
                            if (existingScore != null) {
                                scored++;
                                if (existingScore >= SCORE_THRESHOLD) {
                                    aboveThreshold.push(match.id);
                                }
                                continue;
                            }

                            // Call internal ATS check
                            const response = await fetch(
                                `${getAppUrl() || 'http://localhost:3000'}/api/ats/check`,
                                {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        candidate_id: match.candidate_id,
                                        job_id: match.job_id,
                                        _internal: true,
                                    }),
                                },
                            );

                            if (response.ok) {
                                const result = await response.json();
                                if (result.ats_score >= SCORE_THRESHOLD) {
                                    aboveThreshold.push(match.id);
                                }
                                scored++;
                            }
                        } catch (err) {
                            job.log(`Failed to score match ${match.id}: ${(err as Error).message}`);
                        }
                    }

                    job.updateProgress(Math.round(((i + batch.length) / matchIds.length) * 100));
                }

                // Update run metrics
                const { data: currentRun } = await supabase
                    .from('application_runs')
                    .select('metrics')
                    .eq('id', runId)
                    .single();

                const metrics = (currentRun?.metrics as Record<string, number>) || {};
                await supabase.from('application_runs').update({
                    metrics: { ...metrics, scored, above_threshold: aboveThreshold.length },
                    updated_at: new Date().toISOString(),
                }).eq('id', runId);

                // Mark step complete
                await supabase.from('run_steps').update({
                    status: 'completed',
                    ended_at: new Date().toISOString(),
                    output_json: { scored, above_threshold: aboveThreshold.length },
                }).eq('id', stepId);

                // Enqueue tailor step if matches above threshold
                if (aboveThreshold.length > 0 && tailorQueue) {
                    const { data: tailorStep } = await supabase
                        .from('run_steps')
                        .select('id')
                        .eq('run_id', runId)
                        .eq('step', 'tailor')
                        .single();

                    if (tailorStep) {
                        const tailorData: TailorJobData = {
                            runId,
                            stepId: tailorStep.id,
                            candidateId,
                            matchIds: aboveThreshold,
                        };
                        await tailorQueue.add('tailor-job', tailorData, {
                            attempts: 2,
                            backoff: { type: 'exponential', delay: 10000 },
                        });
                    }
                } else {
                    // No matches above threshold — mark run complete, skip tailor
                    await supabase.from('run_steps')
                        .update({ status: 'skipped' })
                        .eq('run_id', runId)
                        .eq('step', 'tailor');

                    await supabase.from('application_runs').update({
                        status: 'completed',
                        updated_at: new Date().toISOString(),
                    }).eq('id', runId);
                }

                return { scored, aboveThreshold: aboveThreshold.length };
            } catch (err: any) {
                await supabase.from('run_steps').update({
                    status: 'failed',
                    ended_at: new Date().toISOString(),
                    error_json: { message: err.message },
                }).eq('id', stepId);

                await supabase.from('application_runs').update({
                    status: 'failed',
                    error_message: `Score step failed: ${err.message}`,
                    updated_at: new Date().toISOString(),
                }).eq('id', runId);

                throw err;
            }
        },
        {
            ...queueConn,
            concurrency: 1, // LLM scoring is expensive — low concurrency
        },
    );

    worker.on('failed', (job, err) => {
        console.error(`[score-worker] Job ${job?.id} failed:`, err.message);
    });

    return worker;
}

export { createScoreWorker };
