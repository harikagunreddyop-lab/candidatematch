/**
 * Render Worker — BullMQ worker for resume rendering.
 *
 * Takes content_json + template_id, calls worker /render endpoint,
 * updates resume_artifacts with URLs + status.
 */
import { Worker } from 'bullmq';
import { getQueueConnection } from '../redis';
import { createServiceClient } from '@/lib/supabase-server';

export type RenderJobData = {
    artifactId: string;
    candidateId: string;
    contentJson: Record<string, unknown>;
    templateId: string;
};

const RESUME_WORKER_URL = (() => {
    const raw = process.env.RESUME_WORKER_URL?.trim();
    return raw && !raw.includes(':3000') ? raw : 'http://127.0.0.1:3001';
})();

function createRenderWorker() {
    const queueConn = getQueueConnection();
    if (!queueConn) {
        throw new Error('Queue pipeline is not configured (REDIS_URL not set)');
    }
    const worker = new Worker<RenderJobData>(
        'render',
        async (job) => {
            const { artifactId, candidateId, contentJson, templateId } = job.data;
            const supabase = createServiceClient();

            // Mark artifact as rendering
            await supabase.from('resume_artifacts').update({
                status: 'rendering',
                updated_at: new Date().toISOString(),
            }).eq('id', artifactId);

            try {
                const workerSecret = process.env.WORKER_SECRET || '';

                // Call the worker /render endpoint
                const response = await fetch(`${RESUME_WORKER_URL}/render`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Worker-Secret': workerSecret,
                    },
                    body: JSON.stringify({
                        artifact_id: artifactId,
                        candidate_id: candidateId,
                        content_json: contentJson,
                        template_id: templateId,
                    }),
                });

                if (!response.ok) {
                    const errText = await response.text().catch(() => 'unknown');
                    throw new Error(`Worker render failed (${response.status}): ${errText}`);
                }

                const result = await response.json();

                // Update artifact with URLs
                await supabase.from('resume_artifacts').update({
                    docx_url: result.docx_url || null,
                    pdf_url: result.pdf_url || null,
                    status: 'ready',
                    updated_at: new Date().toISOString(),
                }).eq('id', artifactId);

                return result;
            } catch (err: any) {
                await supabase.from('resume_artifacts').update({
                    status: 'failed',
                    error_json: { message: err.message },
                    updated_at: new Date().toISOString(),
                }).eq('id', artifactId);

                throw err;
            }
        },
        {
            ...queueConn,
            concurrency: 3, // Rendering is fast (no LLM)
        },
    );

    worker.on('failed', (job, err) => {
        console.error(`[render-worker] Job ${job?.id} failed:`, err.message);
    });

    return worker;
}

export { createRenderWorker };
