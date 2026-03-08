'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Sparkles, Mail } from 'lucide-react';
import { createClient } from '@/lib/supabase-browser';
import { FloatingInput } from '@/components/auth';

function getAppUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/$/, '');
}

export default function MagicLinkPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  async function sendMagicLink(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    if (!email.trim()) {
      setError('Enter your email address');
      return;
    }
    setLoading(true);

    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${getAppUrl()}/auth/callback`,
      },
    });

    setLoading(false);

    if (err) {
      setError(err.message);
      return;
    }

    setSent(true);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0a0f] via-[#1a1a24] to-[#0a0a0f] flex items-center justify-center px-8 py-12">
      {!sent ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <div className="bg-surface-800/50 backdrop-blur-xl border border-surface-700/60 rounded-2xl p-8 shadow-2xl">
            <div className="text-center mb-8">
              <div className="w-14 h-14 bg-violet-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-7 h-7 text-violet-400" />
              </div>
              <h1 className="text-3xl font-bold text-white mb-2">Sign in with email</h1>
              <p className="text-surface-400">
                We&apos;ll send you a magic link for instant access
              </p>
            </div>

            {error && (
              <div className="mb-6 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-200 text-sm">
                {error}
              </div>
            )}

            <form onSubmit={sendMagicLink} className="space-y-4">
              <FloatingInput
                icon={<Mail className="w-5 h-5" />}
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-6 px-6 py-3 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 disabled:opacity-70 text-white rounded-xl font-semibold shadow-lg shadow-violet-500/25 transition-all flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Sending…
                  </>
                ) : (
                  'Send Magic Link'
                )}
              </button>
            </form>

            <div className="mt-6 text-center text-sm text-surface-400">
              <Link href="/auth/login" className="text-violet-400 hover:text-violet-300 font-semibold">
                ← Back to sign in
              </Link>
            </div>
          </div>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-md"
        >
          <div className="bg-surface-800/50 backdrop-blur-xl border border-surface-700/60 rounded-2xl p-8 shadow-2xl text-center">
            <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <Mail className="w-8 h-8 text-emerald-400" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Check your email</h2>
            <p className="text-surface-400 mb-6">
              We&apos;ve sent a magic link to <strong className="text-white">{email}</strong>
            </p>
            <p className="text-sm text-surface-500">
              Click the link in the email to sign in instantly
            </p>
            <p className="text-xs text-surface-500 mt-4">
              Didn’t receive it? Check spam or{' '}
              <button
                type="button"
                onClick={() => setSent(false)}
                className="text-violet-400 hover:text-violet-300 font-medium"
              >
                try again
              </button>
            </p>
            <div className="mt-8 pt-6 border-t border-surface-700">
              <Link href="/auth/login" className="text-sm text-violet-400 hover:text-violet-300 font-semibold">
                ← Back to sign in
              </Link>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
