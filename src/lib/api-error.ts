/**
 * API route error tracking wrapper.
 * Wraps async route handlers and reports uncaught errors to Sentry.
 */
import * as Sentry from '@sentry/nextjs';

type Handler = (request: Request) => Promise<Response>;

export function withErrorTracking(handler: Handler): Handler {
  return async (request: Request) => {
    try {
      return await handler(request);
    } catch (error) {
      const url = request.url;
      const method = request.method;
      Sentry.captureException(error, {
        tags: {
          endpoint: url,
          method,
        },
        extra: {
          requestBody: await request
            .clone()
            .text()
            .catch(() => null),
        },
      });
      console.error('[API Error]', error);
      return Response.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  };
}
