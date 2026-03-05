/**
 * Production-safe logging: verbose logs only in development, errors always.
 * Use in server/API code only (NODE_ENV is set at build/runtime).
 *
 * structuredLog() and logRequest() emit JSON lines to stdout — always visible
 * in AWS Amplify / CloudWatch regardless of NODE_ENV.
 */
const isDev = process.env.NODE_ENV === 'development';

export function log(message: string, ...args: unknown[]): void {
  if (isDev) {
    // eslint-disable-next-line no-console
    console.log(message, ...args);
  }
}

export function warn(message: string, ...args: unknown[]): void {
  if (isDev) {
    // eslint-disable-next-line no-console
    console.warn(message, ...args);
  }
}

/** Use for operational errors that should be visible in production logs. */
export function error(message: string, ...args: unknown[]): void {
  // eslint-disable-next-line no-console
  console.error(message, ...args);
}

/**
 * Emit a structured JSON log line to stdout.
 * Always visible in CloudWatch / Amplify logs regardless of environment.
 *
 * @example
 *   structuredLog('info', 'cron run started', { run_id: '...', mode: 'incremental' });
 *   // → {"ts":"2026-03-05T07:00:00Z","level":"info","msg":"cron run started","run_id":"...","mode":"incremental"}
 */
export function structuredLog(
  level: 'info' | 'warn' | 'error',
  message: string,
  fields?: Record<string, unknown>,
): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...fields,
  });
  // eslint-disable-next-line no-console
  if (level === 'error') console.error(line);
  // eslint-disable-next-line no-console
  else console.log(line);
}

/**
 * Emit a structured request-completion log.
 * Call at the end of an API route handler.
 *
 * @example
 *   logRequest('/api/cron/match', 4200, 200, userId);
 */
export function logRequest(
  route: string,
  durationMs: number,
  statusCode: number,
  userId?: string | null,
): void {
  structuredLog(statusCode >= 500 ? 'error' : 'info', 'request completed', {
    route,
    status: statusCode,
    duration_ms: durationMs,
    user_id: userId ?? null,
  });
}
