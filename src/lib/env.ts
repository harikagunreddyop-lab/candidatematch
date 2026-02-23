/**
 * Server-side env validation. Use in API routes and middleware.
 * Fails fast with clear message; does not log secret values.
 */

function getEnv(key: string): string | undefined {
  return process.env[key];
}

export function requireEnv(key: string): string {
  const v = getEnv(key);
  if (v === undefined || v === '') {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return v;
}

/** Required for Supabase client (browser or server). */
export function getSupabasePublicEnv(): { url: string; anonKey: string } {
  return {
    url: requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    anonKey: requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  };
}

/** Required for service role (API routes only). Call only in API/server code. */
export function getSupabaseServiceKey(): string {
  return requireEnv('SUPABASE_SERVICE_ROLE_KEY');
}

/** Optional; returns undefined if not set. */
export function getOptionalEnv(key: string): string | undefined {
  const v = getEnv(key);
  return v === '' ? undefined : v;
}
