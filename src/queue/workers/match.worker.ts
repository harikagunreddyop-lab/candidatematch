/**
 * Match Worker — deterministic title + skill matching.
 *
 * Consumes jobs from `matchQueue`, runs existing matching logic,
 * writes results to candidate_job_matches, then enqueues score step.
 */
import { Worker } from 'bullmq';
import { getQueueConnection } from '../redis';
import { scoreQueue, type MatchJobData, type ScoreJobData } from '../queues';
import { createServiceClient } from '@/lib/supabase-server';
import { runMatching } from '@/lib/matching';

function createMatchWorker() {
    const worker = new Worker<MatchJobData>(
        'match',
        async (job) => {
            const { runId, stepId, candidateId, intent } = job.data;
            const supabase = createServiceClient();

            // Mark step as running
            await supabase.from('run_steps').update({
                status: 'running',
                started_at: new Date().toISOString(),
            }).eq('id', stepId);

            try {
                // Run existing matching engine for this candidate
                const result = await runMatching(candidateId, (msg) => {
                    job.log(msg);
                }, {
                    jobsSince: (intent as any)?.jobsSince,
                });

                // Gather match IDs for scoring
                const { data: matches } = await supabase
                    .from('candidate_job_matches')
                    .select('id')
                    .eq('candidate_id', candidateId)
                    .is('ats_score', null) // only unscored matches
                    .order('fit_score', { ascending: false })
                    .limit((intent as any)?.maxJobs || 50);

                const matchIds = (matches || []).map((m: any) => m.id);

                // Update run metrics
                await supabase.from('application_runs').update({
                    metrics: {
                        jobs_seen: result.total_matches_upserted || 0,
                        matches: matchIds.length,
                        scored: 0,
                        tailored: 0,
                        applied: 0,
                    },
                    updated_at: new Date().toISOString(),
                }).eq('id', runId);

                // Mark step complete
                await supabase.from('run_steps').update({
                    status: 'completed',
                    ended_at: new Date().toISOString(),
                    output_json: {
                        candidates_processed: result.candidates_processed,
                        total_matches: result.total_matches_upserted,
                        match_ids_for_scoring: matchIds.length,
                    },
                }).eq('id', stepId);

                // Enqueue score step if we have matches
                if (matchIds.length > 0) {
                    const { data: scoreStep } = await supabase
                        .from('run_steps')
                        .select('id')
                        .eq('run_id', runId)
                        .eq('step', 'score')
                        .single();

                    if (scoreStep) {
                        const scoreData: ScoreJobData = {
                            runId,
                            stepId: scoreStep.id,
                            candidateId,
                            matchIds,
                        };
                        await scoreQueue.add('score-job', scoreData, {
                            attempts: 3,
                            backoff: { type: 'exponential', delay: 5000 },
                        });
                    }
                } else {
                    // No matches — mark run complete
                    await supabase.from('application_runs').update({
                        status: 'completed',
                        updated_at: new Date().toISOString(),
                    }).eq('id', runId);

                    // Skip remaining steps
                    await supabase.from('run_steps')
                        .update({ status: 'skipped' })
                        .eq('run_id', runId)
                        .in('step', ['score', 'tailor']);
                }

                return { matchIds };
            } catch (err: any) {
                // Mark step failed
                await supabase.from('run_steps').update({
                    status: 'failed',
                    ended_at: new Date().toISOString(),
                    error_json: { message: err.message, stack: err.stack },
                }).eq('id', stepId);

                // Mark run failed
                await supabase.from('application_runs').update({
                    status: 'failed',
                    error_message: `Match step failed: ${err.message}`,
                    updated_at: new Date().toISOString(),
                }).eq('id', runId);

                throw err;
            }
        },
        {
            ...getQueueConnection(),
            concurrency: 2,
        },
    );

    worker.on('failed', (job, err) => {
        console.error(`[match-worker] Job ${job?.id} failed:`, err.message);
    });

    worker.on('completed', (job) => {
        console.log(`[match-worker] Job ${job.id} completed`);
    });

    return worker;
}

export { createMatchWorker };
