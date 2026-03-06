/**
 * Named BullMQ queues for the application run pipeline.
 */
import { Queue } from 'bullmq';
import { getQueueConnection } from './redis';

const connOpts = getQueueConnection();
const queuesEnabled = !!connOpts;

/** Deterministic matching: candidate × jobs → candidate_job_matches rows */
export const matchQueue: Queue | null = queuesEnabled ? new Queue('match', connOpts!) : null;

/** ATS scoring: score top N matches via LLM/deterministic engine */
export const scoreQueue: Queue | null = queuesEnabled ? new Queue('score', connOpts!) : null;

/** Resume tailoring: generate tailored resume for high-scoring matches */
export const tailorQueue: Queue | null = queuesEnabled ? new Queue('tailor', connOpts!) : null;

/** Resume rendering: content_json → DOCX + PDF */
export const renderQueue: Queue | null = queuesEnabled ? new Queue('render', connOpts!) : null;

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
