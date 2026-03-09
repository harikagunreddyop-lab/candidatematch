'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Mail, ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase-browser';
import { FloatingInput } from '@/components/auth';
import { getAppUrl } from '@/config';

function getAppUrlWithFallback(): string {
  return (getAppUrl() || (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/$/, '');
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim()) {
      setError('Enter your email address');
      return;
    }
    setLoading(true);

    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${getAppUrlWithFallback()}/auth/reset-password`,
    });

    setLoading(false);

    if (err) {
      setError(err.message);
      return;
    }

    setSent(true);
  }

  if (sent) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0a0a0f] via-[#1a1a24] to-[#0a0a0f] flex items-center justify-center px-8 py-12">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md"
        >
          <div className="bg-surface-800/50 backdrop-blur-xl border border-surface-700/60 rounded-2xl p-8 text-center shadow-2xl">
            <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <Mail className="w-8 h-8 text-emerald-400" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Check your email</h2>
            <p className="text-surface-400 mb-6">
              We&apos;ve sent a password reset link to <strong className="text-white">{email}</strong>
            </p>
            <p className="text-sm text-surface-500 mb-6">
              Click the link to set a new password. It may take a few minutes to arrive.
            </p>
            <Link
              href="/auth/login"
              className="inline-flex items-center gap-2 text-brand-400 hover:text-brand-300 font-semibold"
            >
              <ArrowLeft className="w-4 h-4" /> Back to sign in
            </Link>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0a0f] via-[#1a1a24] to-[#0a0a0f] flex items-center justify-center px-8 py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="bg-surface-800/50 backdrop-blur-xl border border-surface-700/60 rounded-2xl p-8 shadow-2xl">
          <h1 className="text-2xl font-bold text-[#0a0a0a] text-center mb-2">Forgot password?</h1>
          <p className="text-surface-400 text-center mb-8">
            Enter your email and we&apos;ll send you a link to reset your password
          </p>

          {error && (
            <div className="mb-6 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-200 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <FloatingInput
              icon={<Mail className="w-5 h-5" />}
              type="email"
              placeholder="Email Address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />

            <button
              type="submit"
              disabled={loading}
              className="w-full px-6 py-3 bg-brand-400 hover:bg-brand-300 disabled:opacity-70 text-[#0a0f00] rounded-xl font-semibold shadow-lime hover:shadow-lime-lg transition-all flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Sending…
                </>
              ) : (
                'Send Reset Link'
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <Link href="/auth/login" className="text-sm text-brand-400 hover:text-brand-300 font-semibold inline-flex items-center gap-1">
              <ArrowLeft className="w-4 h-4" /> Back to sign in
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
