import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';

/**
 * Sends a test exception to Sentry so you can verify installation.
 * Protected: requires CRON_SECRET in Authorization header or ?key=CRON_SECRET.
 *
 * Verify in Sentry: Project → Issues (or "Verify Installation" page) should show
 * the event within a few seconds.
 *
 * Example:
 *   curl -H "Authorization: Bearer YOUR_CRON_SECRET" "https://your-app/api/sentry-test"
 *   curl "https://your-app/api/sentry-test?key=YOUR_CRON_SECRET"
 */
export async function GET(request: Request) {
  const dsn =
    process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN;
  if (!dsn) {
    return NextResponse.json(
      { error: 'Sentry DSN not set (NEXT_PUBLIC_SENTRY_DSN or SENTRY_DSN)' },
      { status: 503 }
    );
  }

  const url = new URL(request.url);
  const queryKey = url.searchParams.get('key');
  const authHeader = request.headers.get('authorization');
  const bearer =
    authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const cronSecret = process.env.CRON_SECRET;
  const allowed =
    process.env.NODE_ENV === 'development' ||
    (cronSecret && (queryKey === cronSecret || bearer === cronSecret));

  if (!allowed) {
    return NextResponse.json(
      { error: 'Unauthorized. Use Authorization: Bearer CRON_SECRET or ?key=CRON_SECRET' },
      { status: 401 }
    );
  }

  const testError = new Error('Sentry verification test event');
  Sentry.captureException(testError);
  return NextResponse.json({
    ok: true,
    message: 'Test event sent to Sentry. Check your project’s Issues or Verify Installation page.',
  });
}
