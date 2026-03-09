/**
 * Centralized configuration with Zod validation.
 * Loads at startup (via instrumentation). Fails fast with clear errors.
 *
 * - Required vars: Supabase (app won't start without them)
 * - Optional vars: Stripe, Resend, Redis, etc. (features degrade gracefully)
 * - Production: CRON_SECRET required when cron endpoints are used
 */
import { z } from 'zod';

function shouldEmitOperationalWarnings(): boolean {
  return process.env.NEXT_PHASE !== 'phase-production-build';
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // App URL — required for auth redirects, invite links, webhooks
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  VERCEL_URL: z.string().optional(), // Set by Vercel
  NEXT_PUBLIC_SITE_URL: z.string().url().optional(),

  // Supabase (required)
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // Security (CRON_SECRET required in production for cron/event endpoints)
  CRON_SECRET: z.string().optional(),
  WORKER_SECRET: z.string().optional(),
  AUTOFILL_ALLOWED_ORIGINS: z.string().optional(),

  // Anthropic (optional for dev; required for AI features)
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_TIMEOUT_MS: z.string().optional().transform((v) => parseInt(v || '30000', 10)),

  // Stripe (optional until billing enabled)
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  // Email Resend (optional)
  RESEND_API_KEY: z.string().optional(),
  FROM_EMAIL: z.string().email().optional(),

  // Redis
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  REDIS_URL: z.string().optional(),

  // Resume worker
  RESUME_WORKER_URL: z.string().url().optional(),

  // Monitoring
  NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
  SENTRY_DSN: z.string().url().optional(),
  SENTRY_AUTH_TOKEN: z.string().optional(),
  NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
  NEXT_PUBLIC_POSTHOG_HOST: z.string().url().optional(),

  // Feature flags (env-based)
  FEATURE_BILLING_ENABLED: z.string().optional().transform((v) => v === 'true'),
  FEATURE_EMAIL_ENABLED: z.string().optional().transform((v) => v === 'true'),
  FEATURE_AI_MATCHING_ENABLED: z.string().optional().transform((v) => v !== 'false'),

  // Rate limiting
  RATE_LIMIT_ENABLED: z.string().optional().transform((v) => v !== 'false'),
  RATE_LIMIT_MAX_REQUESTS: z.string().optional().transform((v) => parseInt(v || '100', 10)),
  RATE_LIMIT_WINDOW_MS: z.string().optional().transform((v) => parseInt(v || '60000', 10)),
});

export type Config = z.infer<typeof envSchema>;

function loadConfig(): Config {
  // #region agent log
  fetch('http://127.0.0.1:7830/ingest/7e7b9384-2f83-41f7-a326-f10ef9606c50',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'05ff1b'},body:JSON.stringify({sessionId:'05ff1b',runId:'pre-fix-1',hypothesisId:'H1',location:'src/config/index.ts:70',message:'loadConfig env presence',data:{nodeEnv:process.env.NODE_ENV ?? null,hasSupabaseUrl:Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),hasSupabaseAnonKey:Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),hasServiceRoleKey:Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),hasCronSecret:Boolean(process.env.CRON_SECRET),hasRedisUrl:Boolean(process.env.REDIS_URL),hasUpstashUrl:Boolean(process.env.UPSTASH_REDIS_REST_URL)},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  const parsed = envSchema.safeParse({
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    VERCEL_URL: process.env.VERCEL_URL,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    CRON_SECRET: process.env.CRON_SECRET,
    WORKER_SECRET: process.env.WORKER_SECRET,
    AUTOFILL_ALLOWED_ORIGINS: process.env.AUTOFILL_ALLOWED_ORIGINS,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    ANTHROPIC_TIMEOUT_MS: process.env.ANTHROPIC_TIMEOUT_MS,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    FROM_EMAIL: process.env.FROM_EMAIL,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
    REDIS_URL: process.env.REDIS_URL,
    RESUME_WORKER_URL: process.env.RESUME_WORKER_URL,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    SENTRY_DSN: process.env.SENTRY_DSN,
    SENTRY_AUTH_TOKEN: process.env.SENTRY_AUTH_TOKEN,
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    FEATURE_BILLING_ENABLED: process.env.FEATURE_BILLING_ENABLED,
    FEATURE_EMAIL_ENABLED: process.env.FEATURE_EMAIL_ENABLED,
    FEATURE_AI_MATCHING_ENABLED: process.env.FEATURE_AI_MATCHING_ENABLED,
    RATE_LIMIT_ENABLED: process.env.RATE_LIMIT_ENABLED,
    RATE_LIMIT_MAX_REQUESTS: process.env.RATE_LIMIT_MAX_REQUESTS,
    RATE_LIMIT_WINDOW_MS: process.env.RATE_LIMIT_WINDOW_MS,
  });

  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    // #region agent log
    fetch('http://127.0.0.1:7830/ingest/7e7b9384-2f83-41f7-a326-f10ef9606c50',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'05ff1b'},body:JSON.stringify({sessionId:'05ff1b',runId:'pre-fix-1',hypothesisId:'H2',location:'src/config/index.ts:106',message:'env schema validation failed',data:{issueCount:parsed.error.issues.length,issuePaths:parsed.error.issues.map((i)=>i.path.join('.'))},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    throw new Error(`Invalid environment configuration:\n${issues.join('\n')}`);
  }

  const data = parsed.data;
  // #region agent log
  fetch('http://127.0.0.1:7830/ingest/7e7b9384-2f83-41f7-a326-f10ef9606c50',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'05ff1b'},body:JSON.stringify({sessionId:'05ff1b',runId:'pre-fix-1',hypothesisId:'H3',location:'src/config/index.ts:111',message:'env schema validation passed',data:{nodeEnv:data.NODE_ENV,hasAppUrl:Boolean(data.NEXT_PUBLIC_APP_URL || data.NEXT_PUBLIC_SITE_URL || data.VERCEL_URL),featureBillingEnabled:data.FEATURE_BILLING_ENABLED,featureEmailEnabled:data.FEATURE_EMAIL_ENABLED,rateLimitEnabled:data.RATE_LIMIT_ENABLED},timestamp:Date.now()})}).catch(()=>{});
  // #endregion

  // Production: warn if CRON_SECRET missing (cron endpoints may be unprotected)
  if (data.NODE_ENV === 'production' && !data.CRON_SECRET) {
    // #region agent log
    fetch('http://127.0.0.1:7830/ingest/7e7b9384-2f83-41f7-a326-f10ef9606c50',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'05ff1b'},body:JSON.stringify({sessionId:'05ff1b',runId:'pre-fix-1',hypothesisId:'H4',location:'src/config/index.ts:114',message:'production without CRON_SECRET',data:{nodeEnv:data.NODE_ENV,hasCronSecret:Boolean(data.CRON_SECRET)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    if (shouldEmitOperationalWarnings()) {
      console.warn(
        '[config] CRON_SECRET not set in production. Cron/event endpoints may be unprotected.'
      );
    }
  }

  return data;
}

export const config = loadConfig();

/**
 * App base URL for auth redirects, invite links, webhooks.
 * Development: falls back to localhost:3000.
 * Production: uses NEXT_PUBLIC_APP_URL, VERCEL_URL, or NEXT_PUBLIC_SITE_URL.
 */
export function getAppUrl(): string {
  const url =
    config.NEXT_PUBLIC_APP_URL ||
    config.NEXT_PUBLIC_SITE_URL ||
    (config.VERCEL_URL ? `https://${config.VERCEL_URL}` : null);

  if (url) return url.replace(/\/$/, '');

  if (config.NODE_ENV === 'development') {
    return 'http://localhost:3000';
  }

  // #region agent log
  fetch('http://127.0.0.1:7830/ingest/7e7b9384-2f83-41f7-a326-f10ef9606c50',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'05ff1b'},body:JSON.stringify({sessionId:'05ff1b',runId:'pre-fix-1',hypothesisId:'H5',location:'src/config/index.ts:142',message:'getAppUrl resolved empty in non-dev',data:{nodeEnv:config.NODE_ENV,hasNextPublicAppUrl:Boolean(config.NEXT_PUBLIC_APP_URL),hasNextPublicSiteUrl:Boolean(config.NEXT_PUBLIC_SITE_URL),hasVercelUrl:Boolean(config.VERCEL_URL)},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  return '';
}
