/**
 * Server-side PostHog capture for API routes. Uses posthog-node.
 * Only captures when NEXT_PUBLIC_POSTHOG_KEY is set.
 */
import { PostHog } from 'posthog-node';

export async function captureServerEvent(
  distinctId: string,
  event: string,
  properties?: Record<string, unknown>
): Promise<void> {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return;
  const client = new PostHog(key, {
    host: 'https://us.i.posthog.com',
    flushAt: 1,
    flushInterval: 0,
  });
  try {
    client.capture({ distinctId, event, properties });
    await client.shutdown();
  } catch (_) {
    // best-effort
  }
}

export const AnalyticsEvents = {
  JOB_CREATED: 'job_created',
  USER_SIGNED_UP: 'user_signed_up',
  USER_LOGGED_IN: 'user_logged_in',
  COMPANY_CREATED: 'company_created',
  RECRUITER_INVITED: 'recruiter_invited',
  RECRUITER_JOINED: 'recruiter_joined',
  JOB_VIEWED: 'job_viewed',
  JOB_APPLIED: 'job_applied',
  PROFILE_COMPLETED: 'profile_completed',
  MATCH_VIEWED: 'match_viewed',
  CANDIDATE_CONTACTED: 'candidate_contacted',
  MATCHING_RUN: 'matching_run',
  INGESTION_RUN: 'ingestion_run',
} as const;
