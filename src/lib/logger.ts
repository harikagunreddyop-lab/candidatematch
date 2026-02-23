/**
 * Production-safe logging: verbose logs only in development, errors always.
 * Use in server/API code only (NODE_ENV is set at build/runtime).
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
