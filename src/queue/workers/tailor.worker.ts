/**
 * Tailor Worker — resume tailoring for high-scoring matches.
 *
 * Consumes jobs from `tailorQueue`, triggers resume generation
 * for each above-threshold match, and marks the run complete.
 */
import { Worker } from 'bullmq';
import { getQueueConnection } from '../redis';
import { type TailorJobData } from '../queues';
import { createServiceClient } from '@/lib/supabase-server';

function createTailorWorker() {
    const worker = new Worker<TailorJobData>(
        'tailor',
        async (job) => {
            const { runId, stepId, candidateId, matchIds } = job.data;
            const supabase = createServiceClient();

            // Mark step as running
            await supabase.from('run_steps').update({
                status: 'running',
                started_at: new Date().toISOString(),
            }).eq('id', stepId);

            try {
                let tailored = 0;

                // Fetch candidate data
                const { data: candidate } = await supabase
                    .from('candidates')
                    .select('id, full_name, email')
                    .eq('id', candidateId)
                    .single();

                if (!candidate) throw new Error('Candidate not found');

                // For each high-scoring match, trigger resume tailoring
                for (const matchId of matchIds) {
                    try {
                        const { data: match } = await supabase
                            .from('candidate_job_matches')
                            .select('job_id, ats_score')
                            .eq('id', matchId)
                            .single();

                        if (!match) continue;

                        // Trigger tailored resume via internal API
                        const response = await fetch(
                            `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/resumes`,
                            {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    candidate_id: candidateId,
                                    job_id: match.job_id,
                                    _internal: true,
                                }),
                            },
                        );

                        if (response.ok) {
                            tailored++;
                        } else {
                            job.log(`Failed to tailor resume for match ${matchId}: ${response.status}`);
                        }
                    } catch (err) {
                        job.log(`Error tailoring match ${matchId}: ${(err as Error).message}`);
                    }

                    job.updateProgress(Math.round((tailored / matchIds.length) * 100));
                }

                // Update run metrics
                const { data: currentRun } = await supabase
                    .from('application_runs')
                    .select('metrics')
                    .eq('id', runId)
                    .single();

                const metrics = (currentRun?.metrics as Record<string, number>) || {};
                await supabase.from('application_runs').update({
                    metrics: { ...metrics, tailored },
                    status: 'completed',
                    updated_at: new Date().toISOString(),
                }).eq('id', runId);

                // Mark step complete
                await supabase.from('run_steps').update({
                    status: 'completed',
                    ended_at: new Date().toISOString(),
                    output_json: { tailored },
                }).eq('id', stepId);

                return { tailored };
            } catch (err: any) {
                await supabase.from('run_steps').update({
                    status: 'failed',
                    ended_at: new Date().toISOString(),
                    error_json: { message: err.message },
                }).eq('id', stepId);

                await supabase.from('application_runs').update({
                    status: 'failed',
                    error_message: `Tailor step failed: ${err.message}`,
                    updated_at: new Date().toISOString(),
                }).eq('id', runId);

                throw err;
            }
        },
        {
            ...getQueueConnection(),
            concurrency: 1,
        },
    );

    worker.on('failed', (job, err) => {
        console.error(`[tailor-worker] Job ${job?.id} failed:`, err.message);
    });

    return worker;
}

export { createTailorWorker };
