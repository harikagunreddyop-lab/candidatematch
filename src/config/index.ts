/**
 * Centralized configuration with Zod validation.
 * Optional env vars (Stripe, Resend, etc.) are optional(); app runs without them.
 */
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),

  // Supabase (required)
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // Anthropic (optional for dev)
  ANTHROPIC_API_KEY: z.string().optional(),

  // Stripe (optional until billing enabled)
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  // Email Resend (optional)
  RESEND_API_KEY: z.string().optional(),
  FROM_EMAIL: z.string().email().optional(),

  // Redis (Upstash for Edge/cache)
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  REDIS_URL: z.string().optional(),

  // Resume worker
  RESUME_WORKER_URL: z.string().url().optional(),

  // Monitoring
  NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
  SENTRY_AUTH_TOKEN: z.string().optional(),
  NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
  NEXT_PUBLIC_POSTHOG_HOST: z.string().url().optional(),

  // Feature flags (env-based)
  FEATURE_BILLING_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  FEATURE_EMAIL_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  FEATURE_AI_MATCHING_ENABLED: z
    .string()
    .optional()
    .transform((v) => v !== 'false'),

  // Rate limiting
  RATE_LIMIT_ENABLED: z
    .string()
    .optional()
    .transform((v) => v !== 'false'),
  RATE_LIMIT_MAX_REQUESTS: z
    .string()
    .optional()
    .transform((v) => parseInt(v || '100', 10)),
  RATE_LIMIT_WINDOW_MS: z
    .string()
    .optional()
    .transform((v) => parseInt(v || '60000', 10)),
});

export type Config = z.infer<typeof envSchema>;

function loadConfig(): Config {
  const parsed = envSchema.safeParse({
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
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
    console.error('Invalid environment configuration:');
    parsed.error.issues.forEach((err) => {
      console.error(`  ${err.path.join('.')}: ${err.message}`);
    });
    throw new Error('Invalid environment configuration. Check server logs.');
  }

  return parsed.data;
}

export const config = loadConfig();
