/**
 * Next.js instrumentation: Sentry init for Node and Edge runtimes.
 * Replaces sentry.server.config.ts and sentry.edge.config.ts.
 */
import * as Sentry from '@sentry/nextjs';

export async function register() {
  const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;

  if (process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init({
      dsn,
      enabled: true,
      tracesSampleRate: 0.1,
      environment: process.env.NODE_ENV,
    });
  } else {
    Sentry.init({
      dsn,
      enabled: true,
      tracesSampleRate: 0.1,
      environment: process.env.NODE_ENV,
    });
  }
}
