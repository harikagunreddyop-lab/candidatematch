/**
 * Named BullMQ queues for the application run pipeline.
 */
import { Queue } from 'bullmq';
import { getQueueConnection } from './redis';

const connOpts = getQueueConnection();

/** Deterministic matching: candidate × jobs → candidate_job_matches rows */
export const matchQueue = new Queue('match', connOpts);

/** ATS scoring: score top N matches via LLM/deterministic engine */
export const scoreQueue = new Queue('score', connOpts);

/** Resume tailoring: generate tailored resume for high-scoring matches */
export const tailorQueue = new Queue('tailor', connOpts);

/** Resume rendering: content_json → DOCX + PDF */
export const renderQueue = new Queue('render', connOpts);

export type MatchJobData = {
    runId: string;
    stepId: string;
    candidateId: string;
    intent: Record<string, unknown>;
};

export type ScoreJobData = {
    runId: string;
    stepId: string;
    candidateId: string;
    matchIds: string[]; // candidate_job_matches IDs to score
};

export type TailorJobData = {
    runId: string;
    stepId: string;
    candidateId: string;
    matchIds: string[]; // matches above threshold to tailor
};
