/**
 * Auth layout: force dynamic rendering so Supabase client is not created at build time.
 * Fixes prerender errors when NEXT_PUBLIC_SUPABASE_* env vars are not available during build.
 */
export const dynamic = 'force-dynamic';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children;
}
