/**
 * Runtime type guards for API responses and domain objects.
 * Use these when validating data from Supabase or fetch() before use.
 */

import type { Candidate, Job, Application, CandidateJobMatch } from '@/types';

/** Type guard: value is a non-null object with an 'id' string. */
export function hasId(value: unknown): value is { id: string } {
  return typeof value === 'object' && value !== null && typeof (value as { id?: unknown }).id === 'string';
}

/** Type guard: value looks like a Candidate (minimal shape). */
export function isCandidate(value: unknown): value is Candidate {
  if (typeof value !== 'object' || value === null) return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.full_name === 'string' &&
    Array.isArray(o.skills) &&
    Array.isArray(o.experience) &&
    Array.isArray(o.education) &&
    Array.isArray(o.certifications)
  );
}

/** Type guard: value looks like a Job (minimal shape). */
export function isJob(value: unknown): value is Job {
  if (typeof value !== 'object' || value === null) return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.title === 'string' &&
    typeof o.company === 'string' &&
    typeof o.dedupe_hash === 'string' &&
    typeof o.is_active === 'boolean'
  );
}

/** Type guard: value looks like an Application (minimal shape). */
export function isApplication(value: unknown): value is Application {
  if (typeof value !== 'object' || value === null) return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.candidate_id === 'string' &&
    typeof o.job_id === 'string' &&
    typeof o.status === 'string' &&
    typeof o.created_at === 'string'
  );
}

/** Type guard: value looks like a CandidateJobMatch (minimal shape). */
export function isCandidateJobMatch(value: unknown): value is CandidateJobMatch {
  if (typeof value !== 'object' || value === null) return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.candidate_id === 'string' &&
    typeof o.job_id === 'string' &&
    typeof o.fit_score === 'number' &&
    Array.isArray(o.matched_keywords) &&
    Array.isArray(o.missing_keywords)
  );
}

/** Assert value is an array of T; use after validating each item with a type guard. */
export function asArray<T>(value: unknown, guard: (v: unknown) => v is T): T[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is T => guard(v));
}

/** Safe parse JSON with optional type guard for the result. */
export function parseJSON<T>(json: string, guard?: (v: unknown) => v is T): T | null {
  try {
    const parsed: unknown = JSON.parse(json);
    if (guard && !guard(parsed)) return null;
    return parsed as T;
  } catch {
    return null;
  }
}
