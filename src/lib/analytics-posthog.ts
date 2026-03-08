import posthog from 'posthog-js';

const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://app.posthog.com';

if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_POSTHOG_KEY) {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
    api_host: posthogHost,
    capture_pageview: false,
    capture_pageleave: true,
    autocapture: false,
  });
}

export const posthogAnalytics = {
  track: (event: string, properties?: Record<string, unknown>) => {
    if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_POSTHOG_KEY) {
      posthog.capture(event, properties);
    }
  },
  identify: (userId: string, traits?: Record<string, unknown>) => {
    if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_POSTHOG_KEY) {
      posthog.identify(userId, traits);
    }
  },
  page: (name: string, properties?: Record<string, unknown>) => {
    if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_POSTHOG_KEY) {
      posthog.capture('$pageview', { page: name, ...properties });
    }
  },
  reset: () => {
    if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_POSTHOG_KEY) {
      posthog.reset();
    }
  },
};

export const AnalyticsEvents = {
  USER_SIGNED_UP: 'user_signed_up',
  USER_LOGGED_IN: 'user_logged_in',
  USER_LOGGED_OUT: 'user_logged_out',
  COMPANY_CREATED: 'company_created',
  RECRUITER_INVITED: 'recruiter_invited',
  RECRUITER_JOINED: 'recruiter_joined',
  JOB_CREATED: 'job_created',
  JOB_VIEWED: 'job_viewed',
  JOB_APPLIED: 'job_applied',
  PROFILE_COMPLETED: 'profile_completed',
  MATCH_VIEWED: 'match_viewed',
  CANDIDATE_CONTACTED: 'candidate_contacted',
  MATCHING_RUN: 'matching_run',
  INGESTION_RUN: 'ingestion_run',
} as const;
