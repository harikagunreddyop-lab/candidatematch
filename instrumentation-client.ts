/**
 * Client-side Sentry init. Replaces sentry.client.config.ts (Turbopack-safe).
 */
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';

if (typeof window !== 'undefined' && dsn) {
  const env = process.env.NODE_ENV;
  Sentry.init({
    dsn,
    enabled: true,
    environment: env,
    tracesSampleRate: env === 'production' ? 0.1 : 1.0,
    tracePropagationTargets: ['localhost', /^https?:\/\/[^/]*/.test(appUrl) ? appUrl : 'localhost'],
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    ignoreErrors: [
      'ResizeObserver loop limit exceeded',
      'Non-Error promise rejection captured',
    ],
    beforeSend(event) {
      if (event.request) {
        delete event.request.cookies;
        if (event.request.headers) delete (event.request.headers as Record<string, unknown>)['authorization'];
      }
      if (event.user) {
        delete event.user.email;
        delete event.user.ip_address;
      }
      return event;
    },
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
