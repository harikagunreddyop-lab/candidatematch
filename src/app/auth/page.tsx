'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * /auth redirects to the new login page.
 * Legacy combined login/signup/forgot form is replaced by:
 * - /auth/login — Sign in
 * - /auth/signup — Create account (multi-step)
 * - /auth/magic — Magic link
 * - /auth/reset-password — Forgot password / set password
 */
export default function AuthPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/auth/login');
  }, [router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0a0f] via-[#1a1a24] to-[#0a0a0f] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-violet-500/30 border-t-violet-400 rounded-full animate-spin" />
    </div>
  );
}
