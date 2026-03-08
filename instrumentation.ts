/**
 * Next.js instrumentation: Sentry init for Node and Edge runtimes.
 * Replaces sentry.server.config.ts and sentry.edge.config.ts.
 */
import * as Sentry from '@sentry/nextjs';

export async function register() {
  const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;

  const env = process.env.NODE_ENV;
  const tracesSampleRate = env === 'production' ? 0.1 : 1.0;

  if (process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init({
      dsn,
      enabled: true,
      environment: env,
      tracesSampleRate,
      beforeSend(event) {
        if (event.request) {
          delete event.request.cookies;
          if (event.request.headers) delete (event.request.headers as Record<string, unknown>)['authorization'];
        }
        return event;
      },
    });
  } else {
    Sentry.init({
      dsn,
      enabled: true,
      environment: env,
      tracesSampleRate,
      beforeSend(event) {
        if (event.request) {
          delete event.request.cookies;
          if (event.request.headers) delete (event.request.headers as Record<string, unknown>)['authorization'];
        }
        return event;
      },
    });
  }
}
