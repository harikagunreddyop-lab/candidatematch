/**
 * semantic-similarity.ts
 *
 * Embedding cache + cosine similarity interface for resume↔JD semantic scoring.
 *
 * Strategy:
 *   1. Embeddings are computed ONCE per (document × model) and stored in DB.
 *   2. At scoring time: fetch from cache. If missing, compute + store, then score.
 *   3. Cosine similarity is computed in JS (no pgvector needed at runtime;
 *      pgvector can accelerate ANN search but is NOT required for our use case
 *      of point-to-point candidate×job scoring).
 *   4. Gate: entire module is a no-op when feature flag 'elite.semantic_similarity'
 *      is OFF. Returns null similarity so callers can skip this dimension safely.
 *
 * Provider:
 *   Uses OpenAI text-embedding-3-small by default (1536 dims, $0.02/1M tokens).
 *   Stub interface provided — swap provider by replacing `callEmbeddingApi()`.
 *   If OPENAI_API_KEY is not set, returns null (graceful degradation).
 *
 * Two similarity scores returned:
 *   • resume_jd_similarity:     cosine(full_resume_embedding, jd_embedding)
 *   • bullets_responsibilities: cosine(mean(bullet_embeddings), mean(responsibility_embeddings))
 *     — only computed if responsibilities/bullets arrays are non-empty.
 *
 * Caching:
 *   • DB cache (resume_embeddings, jd_embeddings tables from migration 020)
 *   • In-process Map<id, vector> — cleared on each serverless invocation
 *     (prevents stale hits across deploys, acceptable given small function lifetime)
 */

import { error as logError } from '@/lib/logger';
import { logAiCall } from '@/lib/telemetry';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;

// Max text length sent to embedding API (avoid token limit + cost runaway)
// text-embedding-3-small handles up to 8191 tokens ≈ ~32KB of text.
// We truncate to 6000 chars (~1500 tokens) — captures the dense part of a resume.
const MAX_EMBED_TEXT_LEN = 6000;

// ── Types ─────────────────────────────────────────────────────────────────────

export type EmbeddingVector = number[];

export interface SemanticSimilarityResult {
    /** Cosine similarity between the full resume and the full JD. 0–1. */
    resume_jd_similarity: number;
    /** Cosine similarity between resume bullets and JD responsibilities. Null if either is empty. */
    bullets_responsibilities_similarity: number | null;
    /** Blended semantic score 0–100 for the 'semantic' scoring dimension. */
    semantic_score: number;
    /** Whether this was served from cache (for cost tracking). */
    from_cache: boolean;
}

// ── In-process cache ──────────────────────────────────────────────────────────
// Keys: `resume:${resume_id}` or `job:${job_id}`
const _vectorCache = new Map<string, EmbeddingVector>();

// ── Cosine similarity ─────────────────────────────────────────────────────────

/**
 * Compute cosine similarity between two equal-length vectors.
 * Returns 0 if either vector is all-zeros.
 *
 * Time complexity: O(d) where d = dimensions (1536 for text-embedding-3-small).
 */
export function cosineSimilarity(a: EmbeddingVector, b: EmbeddingVector): number {
    if (a.length !== b.length || a.length === 0) return 0;

    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Compute the element-wise mean of an array of vectors.
 * Used for pooling multiple bullet embeddings into a single vector.
 */
export function meanPooling(vectors: EmbeddingVector[]): EmbeddingVector | null {
    if (vectors.length === 0) return null;
    const dim = vectors[0].length;
    const mean = new Array<number>(dim).fill(0);
    for (const v of vectors) {
        for (let i = 0; i < dim; i++) mean[i] += v[i];
    }
    for (let i = 0; i < dim; i++) mean[i] /= vectors.length;
    return mean;
}

// ── Embedding API call ────────────────────────────────────────────────────────

/**
 * Call the OpenAI Embeddings API for a batch of strings.
 * Returns null if API is unavailable or key not set.
 *
 * This is the ONLY place in this module that calls an external API.
 * To swap providers: replace this function. The rest of the module is provider-agnostic.
 */
async function callEmbeddingApi(
    texts: string[],
    supabase?: any,
    candidateId?: string | null,
    jobId?: string | null,
): Promise<EmbeddingVector[] | null> {
    if (!OPENAI_API_KEY) {
        // Graceful degradation: feature flag should prevent reaching here,
        // but defensive check in case flag check is skipped.
        return null;
    }

    const truncated = texts.map(t => t.slice(0, MAX_EMBED_TEXT_LEN));
    const startMs = Date.now();

    try {
        const response = await fetch('https://api.openai.com/v1/embeddings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
                model: EMBEDDING_MODEL,
                input: truncated,
                dimensions: EMBEDDING_DIMENSIONS,
            }),
        });

        if (!response.ok) {
            logError('[semantic] Embedding API error', response.status, await response.text().catch(() => ''));
            return null;
        }

        const json = await response.json();
        const vectors: EmbeddingVector[] = json.data.map((d: { embedding: number[] }) => d.embedding);

        // Log cost (fire-and-forget)
        if (supabase) {
            const inputTokens = json.usage?.prompt_tokens ?? texts.join(' ').length / 4;
            void logAiCall(supabase, {
                call_type: 'embedding',
                model: EMBEDDING_MODEL,
                input_tokens: inputTokens,
                output_tokens: 0,
                cache_hit: false,
                duration_ms: Date.now() - startMs,
                candidate_id: candidateId ?? null,
                job_id: jobId ?? null,
            });
        }

        return vectors;
    } catch (err) {
        logError('[semantic] callEmbeddingApi failed', err);
        return null;
    }
}

// ── DB cache helpers ──────────────────────────────────────────────────────────

async function getResumeEmbedding(supabase: any, resumeId: string): Promise<EmbeddingVector | null> {
    const cacheKey = `resume:${resumeId}`;
    if (_vectorCache.has(cacheKey)) return _vectorCache.get(cacheKey)!;

    const { data, error } = await supabase
        .from('resume_embeddings')
        .select('embedding_vec, embedding_json')
        .eq('resume_id', resumeId)
        .eq('embedding_model', EMBEDDING_MODEL)
        .maybeSingle();

    if (error || !data) return null;

    // Prefer pgvector column; fall back to JSON array
    const vec: EmbeddingVector | null = data.embedding_vec ?? data.embedding_json ?? null;
    if (vec) _vectorCache.set(cacheKey, vec);
    return vec;
}

async function storeResumeEmbedding(supabase: any, resumeId: string, vec: EmbeddingVector): Promise<void> {
    try {
        // Store as JSON array (always works); embedding_vec populated if pgvector available.
        await supabase.from('resume_embeddings').upsert([{
            resume_id: resumeId,
            embedding_model: EMBEDDING_MODEL,
            embedding_json: vec,
            // embedding_vec is populated by pgvector-aware DB if extension is installed.
            // We let Postgres coerce the JSON array → vector if vector type check passes.
            // On non-pgvector installs this column is null (OK).
        }], { onConflict: 'resume_id,embedding_model' });
        _vectorCache.set(`resume:${resumeId}`, vec);
    } catch (err) {
        logError('[semantic] storeResumeEmbedding failed', err);
    }
}

async function getJdEmbedding(supabase: any, jobId: string): Promise<EmbeddingVector | null> {
    const cacheKey = `job:${jobId}`;
    if (_vectorCache.has(cacheKey)) return _vectorCache.get(cacheKey)!;

    const { data, error } = await supabase
        .from('jd_embeddings')
        .select('embedding_vec, embedding_json')
        .eq('job_id', jobId)
        .eq('embedding_model', EMBEDDING_MODEL)
        .maybeSingle();

    if (error || !data) return null;

    const vec: EmbeddingVector | null = data.embedding_vec ?? data.embedding_json ?? null;
    if (vec) _vectorCache.set(cacheKey, vec);
    return vec;
}

async function storeJdEmbedding(supabase: any, jobId: string, vec: EmbeddingVector): Promise<void> {
    try {
        await supabase.from('jd_embeddings').upsert([{
            job_id: jobId,
            embedding_model: EMBEDDING_MODEL,
            embedding_json: vec,
        }], { onConflict: 'job_id,embedding_model' });
        _vectorCache.set(`job:${jobId}`, vec);
    } catch (err) {
        logError('[semantic] storeJdEmbedding failed', err);
    }
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Compute semantic similarity between a resume and a JD.
 *
 * Returns null if:
 *   - feature flag 'elite.semantic_similarity' is OFF (checked by caller)
 *   - OPENAI_API_KEY is not set
 *   - Any error occurs (graceful degradation)
 *
 * @param supabase    Service-role client
 * @param resumeId    ID in candidate_resumes table
 * @param jobId       ID in jobs table
 * @param resumeText  Full text of the resume (pre-extracted)
 * @param jdText      Full text of the job description
 * @param resumeBullets  Array of resume bullet strings (optional)
 * @param jdResponsibilities  Array of JD responsibility strings (optional)
 */
export async function computeSemanticSimilarity(
    supabase: any,
    resumeId: string,
    jobId: string,
    resumeText: string,
    jdText: string,
    resumeBullets: string[] = [],
    jdResponsibilities: string[] = [],
    candidateId?: string | null,
): Promise<SemanticSimilarityResult | null> {
    if (!OPENAI_API_KEY) return null;

    let fromCache = true;

    try {
        // 1. Get or compute resume embedding
        let resumeVec = await getResumeEmbedding(supabase, resumeId);
        if (!resumeVec) {
            const vecs = await callEmbeddingApi([resumeText], supabase, candidateId, jobId);
            if (!vecs) return null;
            resumeVec = vecs[0];
            await storeResumeEmbedding(supabase, resumeId, resumeVec);
            fromCache = false;
        }

        // 2. Get or compute JD embedding
        let jdVec = await getJdEmbedding(supabase, jobId);
        if (!jdVec) {
            const vecs = await callEmbeddingApi([jdText], supabase, null, jobId);
            if (!vecs) return null;
            jdVec = vecs[0];
            await storeJdEmbedding(supabase, jobId, jdVec);
            fromCache = false;
        }

        // 3. Resume↔JD similarity
        const resumeJdSim = cosineSimilarity(resumeVec, jdVec);

        // 4. Bullet↔Responsibility similarity (optional, best-effort)
        let bulletsSim: number | null = null;
        if (resumeBullets.length > 0 && jdResponsibilities.length > 0) {
            // Cap array sizes to control API cost
            const bulletsSlice = resumeBullets.slice(0, 20);
            const respsSlice = jdResponsibilities.slice(0, 15);

            const bulletTexts = bulletsSlice.join('\n');
            const respText = respsSlice.join('\n');

            const [bVecs, rVecs] = await Promise.all([
                callEmbeddingApi([bulletTexts], supabase, candidateId, jobId),
                callEmbeddingApi([respText], supabase, null, jobId),
            ]);

            if (bVecs && rVecs) {
                bulletsSim = cosineSimilarity(bVecs[0], rVecs[0]);
                fromCache = false;
            }
        }

        // 5. Blended semantic score 0–100
        // Weight: resume↔JD is more reliable (full context); bullets↔resp is bonus signal.
        const semanticScore = bulletsSim != null
            ? Math.round((resumeJdSim * 0.7 + bulletsSim * 0.3) * 100)
            : Math.round(resumeJdSim * 100);

        return {
            resume_jd_similarity: resumeJdSim,
            bullets_responsibilities_similarity: bulletsSim,
            semantic_score: Math.min(100, Math.max(0, semanticScore)),
            from_cache: fromCache,
        };
    } catch (err) {
        logError('[semantic] computeSemanticSimilarity failed', err);
        return null;
    }
}

/**
 * Pre-compute and cache embeddings for a batch of jobs.
 * Called at JD ingest time so scoring runs don't pay the embedding latency.
 *
 * @param supabase  Service-role client
 * @param jobItems  Array of {jobId, jdText} objects
 */
export async function precomputeJdEmbeddings(
    supabase: any,
    jobItems: Array<{ jobId: string; jdText: string }>,
): Promise<void> {
    if (!OPENAI_API_KEY) return;

    const toCompute = await Promise.all(
        jobItems.map(async ({ jobId, jdText }) => {
            const existing = await getJdEmbedding(supabase, jobId);
            return existing ? null : { jobId, jdText };
        })
    );

    const needed = toCompute.filter((x): x is { jobId: string; jdText: string } => x !== null);
    if (needed.length === 0) return;

    // Batch in groups of 10 to stay within API rate limits
    const BATCH_SIZE = 10;
    for (let i = 0; i < needed.length; i += BATCH_SIZE) {
        const batch = needed.slice(i, i + BATCH_SIZE);
        try {
            const vecs = await callEmbeddingApi(batch.map(b => b.jdText), supabase);
            if (vecs) {
                await Promise.all(batch.map((b, idx) => storeJdEmbedding(supabase, b.jobId, vecs[idx])));
            }
        } catch (err) {
            logError('[semantic] precomputeJdEmbeddings batch failed', err);
        }
        // Polite delay between batches
        if (i + BATCH_SIZE < needed.length) {
            await new Promise(r => setTimeout(r, 200));
        }
    }
}
