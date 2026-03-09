/**
 * Centralized configuration with Zod validation.
 * Loads at startup (via instrumentation). Fails fast with clear errors.
 *
 * - Required vars: Supabase (app won't start without them)
 * - Optional vars: Stripe, Resend, Redis, etc. (features degrade gracefully)
 * - Production: CRON_SECRET required when cron endpoints are used
 */
import { z } from 'zod';

const optionalUrl = z.preprocess(
  (value) => {
    if (typeof value !== 'string') return value;
    let normalized = value.trim();
    if (!normalized || normalized === 'undefined' || normalized === 'null') return undefined;
    if (
      (normalized.startsWith('"') && normalized.endsWith('"')) ||
      (normalized.startsWith("'") && normalized.endsWith("'"))
    ) {
      normalized = normalized.slice(1, -1).trim();
    }
    if (normalized.startsWith('<') && normalized.endsWith('>')) {
      normalized = normalized.slice(1, -1).trim();
    }
    if (!normalized || normalized === 'undefined' || normalized === 'null') return undefined;
    return normalized;
  },
  z.string().url().optional(),
);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // App URL — required for auth redirects, invite links, webhooks
  NEXT_PUBLIC_APP_URL: optionalUrl,
  VERCEL_URL: z.string().optional(), // Set by Vercel
  NEXT_PUBLIC_SITE_URL: optionalUrl,

  // Supabase (required)
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // Security (CRON_SECRET required in production for cron/event endpoints)
  CRON_SECRET: z.string().optional(),
  WORKER_SECRET: z.string().optional(),
  EMAIL_TRACKING_SECRET: z.string().optional(),
  AUTOFILL_ALLOWED_ORIGINS: z.string().optional(),

  // Anthropic (optional for dev; required for AI features)
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_TIMEOUT_MS: z.string().optional().transform((v) => parseInt(v || '30000', 10)),

  // Stripe (optional until billing enabled)
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_COMPANY_STARTER_PRICE_ID: z.string().optional(),
  STRIPE_COMPANY_GROWTH_PRICE_ID: z.string().optional(),
  STRIPE_COMPANY_SCALE_PRICE_ID: z.string().optional(),
  STRIPE_COMPANY_ENTERPRISE_PRICE_ID: z.string().optional(),

  // OAuth providers
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  LINKEDIN_CLIENT_ID: z.string().optional(),
  LINKEDIN_CLIENT_SECRET: z.string().optional(),

  // AI + market data
  OPENAI_API_KEY: z.string().optional(),
  ADZUNA_APP_ID: z.string().optional(),
  ADZUNA_APP_KEY: z.string().optional(),
  ADZUNA_COUNTRY: z.string().optional(),

  // Email Resend (optional)
  RESEND_API_KEY: z.string().optional(),
  FROM_EMAIL: z.string().email().optional(),

  // Redis
  UPSTASH_REDIS_REST_URL: optionalUrl,
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  REDIS_URL: z.string().optional(),

  // Resume worker
  RESUME_WORKER_URL: optionalUrl,
  INGEST_CONCURRENCY: z.string().optional().transform((v) => parseInt(v || '5', 10)),
  INGEST_BATCH_SIZE: z.string().optional().transform((v) => parseInt(v || '100', 10)),
  INGEST_TIMEOUT_MS: z.string().optional().transform((v) => parseInt(v || '30000', 10)),

  // Monitoring
  NEXT_PUBLIC_SENTRY_DSN: optionalUrl,
  SENTRY_DSN: optionalUrl,
  SENTRY_AUTH_TOKEN: z.string().optional(),
  NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
  NEXT_PUBLIC_POSTHOG_HOST: optionalUrl,

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
  fetch('http://127.0.0.1:7830/ingest/7e7b9384-2f83-41f7-a326-f10ef9606c50',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'3504db'},body:JSON.stringify({sessionId:'3504db',runId:'pre-fix',hypothesisId:'H1',location:'src/config/index.ts:101',message:'Config parse input snapshot for optional URLs',data:{nextPhase:process.env.NEXT_PHASE||null,nodeEnv:process.env.NODE_ENV||null,resumeWorkerUrlState:typeof process.env.RESUME_WORKER_URL==='string'?(process.env.RESUME_WORKER_URL.trim()? 'present_non_empty':'present_empty'):'unset'},timestamp:Date.now()})}).catch(()=>{});
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
    EMAIL_TRACKING_SECRET: process.env.EMAIL_TRACKING_SECRET,
    AUTOFILL_ALLOWED_ORIGINS: process.env.AUTOFILL_ALLOWED_ORIGINS,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    ANTHROPIC_TIMEOUT_MS: process.env.ANTHROPIC_TIMEOUT_MS,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    STRIPE_COMPANY_STARTER_PRICE_ID: process.env.STRIPE_COMPANY_STARTER_PRICE_ID,
    STRIPE_COMPANY_GROWTH_PRICE_ID: process.env.STRIPE_COMPANY_GROWTH_PRICE_ID,
    STRIPE_COMPANY_SCALE_PRICE_ID: process.env.STRIPE_COMPANY_SCALE_PRICE_ID,
    STRIPE_COMPANY_ENTERPRISE_PRICE_ID: process.env.STRIPE_COMPANY_ENTERPRISE_PRICE_ID,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    LINKEDIN_CLIENT_ID: process.env.LINKEDIN_CLIENT_ID,
    LINKEDIN_CLIENT_SECRET: process.env.LINKEDIN_CLIENT_SECRET,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    ADZUNA_APP_ID: process.env.ADZUNA_APP_ID,
    ADZUNA_APP_KEY: process.env.ADZUNA_APP_KEY,
    ADZUNA_COUNTRY: process.env.ADZUNA_COUNTRY,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    FROM_EMAIL: process.env.FROM_EMAIL,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
    REDIS_URL: process.env.REDIS_URL,
    RESUME_WORKER_URL: process.env.RESUME_WORKER_URL,
    INGEST_CONCURRENCY: process.env.INGEST_CONCURRENCY,
    INGEST_BATCH_SIZE: process.env.INGEST_BATCH_SIZE,
    INGEST_TIMEOUT_MS: process.env.INGEST_TIMEOUT_MS,
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
    // #region agent log
    fetch('http://127.0.0.1:7830/ingest/7e7b9384-2f83-41f7-a326-f10ef9606c50',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'3504db'},body:JSON.stringify({sessionId:'3504db',runId:'pre-fix',hypothesisId:'H4',location:'src/config/index.ts:154',message:'Config schema validation failed',data:{issueCount:parsed.error.issues.length,issuePaths:parsed.error.issues.map((i)=>i.path.join('.'))},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${issues.join('\n')}`);
  }

  const data = parsed.data;
  const isProductionBuildPhase = process.env.NEXT_PHASE === 'phase-production-build';

  // Production runtime: fail fast if auth-critical shared secrets are missing.
  // During Next.js production build, API route modules are evaluated and these
  // secrets may be injected only at deploy/runtime, so we skip this strict gate.
  if (data.NODE_ENV === 'production' && !isProductionBuildPhase && !data.CRON_SECRET) {
    throw new Error('Invalid environment configuration:\n  CRON_SECRET: required in production');
  }
  if (data.NODE_ENV === 'production' && !isProductionBuildPhase && !data.EMAIL_TRACKING_SECRET) {
    throw new Error('Invalid environment configuration:\n  EMAIL_TRACKING_SECRET: required in production');
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

  return '';
}
