/**
 * Structured logging with pino.
 * Use in server/API code only. Child loggers available for modules.
 * Backward-compatible: log(), warn(), error(), structuredLog(), logRequest() still work.
 */
import pino from 'pino';

const isDevelopment = process.env.NODE_ENV === 'development';

const logger = pino({
  level: isDevelopment ? 'debug' : 'info',
  transport:
    isDevelopment
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  base: {
    env: process.env.NODE_ENV,
    revision: process.env.VERCEL_GIT_COMMIT_SHA,
  },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      'email',
      'password',
    ],
    remove: true,
  },
});

export { logger };

export const dbLogger = logger.child({ module: 'database' });
export const authLogger = logger.child({ module: 'auth' });
export const apiLogger = logger.child({ module: 'api' });
export const matchingLogger = logger.child({ module: 'matching' });

export function log(message: string, ...args: unknown[]): void {
  if (args.length > 0) logger.debug({ msg: message, args }, message);
  else logger.debug(message);
}

export function warn(message: string, ...args: unknown[]): void {
  if (args.length > 0) logger.warn({ msg: message, args }, message);
  else logger.warn(message);
}

export function error(message: string, ...args: unknown[]): void {
  if (args.length > 0) logger.error({ msg: message, args }, message);
  else logger.error(message);
}

export function structuredLog(
  level: 'info' | 'warn' | 'error',
  message: string,
  fields?: Record<string, unknown>,
): void {
  const payload = { msg: message, ...fields };
  if (level === 'error') logger.error(payload, message);
  else if (level === 'warn') logger.warn(payload, message);
  else logger.info(payload, message);
}

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
