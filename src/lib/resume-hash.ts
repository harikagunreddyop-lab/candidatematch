/**
 * Stable content hash for resume artifact deduplication.
 *
 * Hash inputs: candidate skills + experience + JD text + template ID.
 * Same inputs → same hash → cache hit → skip LLM + render.
 */
import { createHash } from 'crypto';

export interface HashInputs {
    candidateId: string;
    skills: unknown;
    experience: unknown;
    education?: unknown;
    certifications?: unknown;
    jdClean: string;
    templateId: string;
}

/**
 * Produces a deterministic SHA-256 hash from resume generation inputs.
 * Normalizes JSON to ensure consistent ordering.
 */
export function computeContentHash(inputs: HashInputs): string {
    const normalized = JSON.stringify({
        c: inputs.candidateId,
        s: sortedJson(inputs.skills),
        e: sortedJson(inputs.experience),
        ed: sortedJson(inputs.education || []),
        cr: sortedJson(inputs.certifications || []),
        jd: inputs.jdClean.trim().toLowerCase().slice(0, 5000),
        t: inputs.templateId,
    });

    return createHash('sha256').update(normalized).digest('hex');
}

/** Sort object keys for deterministic JSON. */
function sortedJson(val: unknown): string {
    return JSON.stringify(val, Object.keys(val as object || {}).sort());
}
