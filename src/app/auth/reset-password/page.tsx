'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { createClient } from '@/lib/supabase-browser';
import { Eye, EyeOff, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // null = still checking, true = ready, false = failed/expired
  const [sessionReady, setSessionReady] = useState<boolean | null>(null);
  const [statusMsg, setStatusMsg] = useState('Setting up your session…');

  // Prevent double-runs in React Strict Mode
  const didRun = useRef(false);

  useEffect(() => {
    if (didRun.current) return;
    didRun.current = true;

    let cancelled = false;

    const run = async () => {
      // ── 1. PKCE ?code= flow ──────────────────────────────────────────────
      // This is the most common flow when Supabase sends invite/recovery emails
      // and your redirect URL is set correctly in Supabase Dashboard.
      const code = typeof window !== 'undefined' ? searchParams.get('code') : null;

      if (code) {
        setStatusMsg('Verifying your invite link…');
        try {
          const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (cancelled) return;

          if (!exchangeError && data?.session) {
            // Remove code from URL bar (cleaner UX, avoid re-exchange on refresh)
            window.history.replaceState({}, '', window.location.pathname);
            setSessionReady(true);
            return;
          }

          // Exchange failed (expired link, already used, etc.)
          console.warn('Code exchange failed:', exchangeError?.message);
          setSessionReady(false);
          return;
        } catch (err) {
          if (cancelled) return;
          console.warn('Code exchange threw:', err);
          setSessionReady(false);
          return;
        }
      }

      // ── 2. Hash / implicit flow ──────────────────────────────────────────
      // Older Supabase versions or certain email templates send tokens in the
      // URL hash: /auth/reset-password#access_token=...&type=recovery
      // @supabase/auth-js detects and processes this automatically on init,
      // but it takes a tick — we poll briefly.
      const hash = typeof window !== 'undefined' ? window.location.hash : '';
      const hasAuthHash =
        hash.includes('access_token=') ||
        hash.includes('type=recovery') ||
        hash.includes('type=invite');

      if (hasAuthHash) {
        setStatusMsg('Processing your invite link…');
        // Give the Supabase client up to 12 seconds to auto-process the hash
        for (let i = 0; i < 40; i++) {
          if (cancelled) return;
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            setSessionReady(true);
            return;
          }
          await new Promise(r => setTimeout(r, 300));
        }
        if (!cancelled) setSessionReady(false);
        return;
      }

      // ── 3. No code, no hash — check for an existing session ─────────────
      // This covers the case where the user is already authenticated
      // (e.g. admin triggered a password reset while logged in).
      setStatusMsg('Checking session…');
      for (let i = 0; i < 10; i++) {
        if (cancelled) return;
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          setSessionReady(true);
          return;
        }
        await new Promise(r => setTimeout(r, 300));
      }

      // ── 4. Truly no session — show error, don't auto-redirect ───────────
      // The original code redirected to /?error=auth here after 3 s, which is
      // what was booting candidates off the page before they could type.
      // We now show a helpful message instead and let the user navigate.
      if (!cancelled) {
        setSessionReady(false);
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    const { error: err } = await supabase.auth.updateUser({ password });
    if (err) {
      setLoading(false);
      setError(err.message);
      return;
    }

    // Password creation = acceptance of invite.
    // Create/link candidate record and set invite_accepted_at.
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      try {
        await fetch('/api/invite/accept-invite', {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
      } catch {
        // Non-fatal — user can still proceed to dashboard
      }
    }

    setLoading(false);
    setSuccess(true);

    // Determine where to send the user
    const { data: { user } } = await supabase.auth.getUser();
    const { data: profile } = user
      ? await supabase.from('profiles').select('role').eq('id', user.id).single()
      : { data: null };

    const dest =
      profile?.role === 'admin'     ? '/dashboard/admin'
      : profile?.role === 'recruiter' ? '/dashboard/recruiter'
      : '/dashboard/candidate';

    setTimeout(() => {
      router.push(dest);
      router.refresh();
    }, 1800);
  };

  // ── Helpers ──────────────────────────────────────────────────────────────

  const hashPresent =
    typeof window !== 'undefined' &&
    (window.location.hash.includes('access_token=') ||
      window.location.hash.includes('type=recovery') ||
      window.location.hash.includes('type=invite'));

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-surface-50 dark:bg-surface-900 px-4">
      {/* Logo */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-12 h-12 rounded-2xl overflow-hidden bg-white dark:bg-surface-800 flex items-center justify-center shadow-lg shadow-brand-500/25 border border-surface-200 dark:border-surface-600">
          <Image src="/logo.png" alt="Logo" width={48} height={48} className="object-contain" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-100 font-display tracking-tight">
            Orion CMOS
          </h1>
          <p className="text-xs text-surface-500 dark:text-surface-300 font-medium tracking-wide uppercase">
            Set new password
          </p>
        </div>
      </div>

      <div className="card p-8 max-w-md w-full dark:bg-surface-800 dark:border-surface-600">

        {/* ── Success state ── */}
        {success && (
          <div className="text-center py-4">
            <CheckCircle2 size={48} className="mx-auto text-green-500 dark:text-green-400 mb-3" />
            <p className="text-sm font-medium text-green-800 dark:text-green-200">
              Password updated. Redirecting to your dashboard…
            </p>
          </div>
        )}

        {/* ── Loading / polling state ── */}
        {!success && sessionReady === null && (
          <div className="text-center py-10 space-y-3">
            {/* Spinner */}
            <div className="flex justify-center">
              <span className="w-8 h-8 border-[3px] border-brand-200 border-t-brand-600 rounded-full animate-spin" />
            </div>
            <p className="text-sm text-surface-700 dark:text-surface-300 font-medium">{statusMsg}</p>
            <p className="text-xs text-surface-400 dark:text-surface-500">
              Please keep this tab open — this only takes a moment.
            </p>
          </div>
        )}

        {/* ── Expired / invalid link ── */}
        {!success && sessionReady === false && hashPresent && (
          <div className="text-center py-6 space-y-3">
            <AlertCircle size={40} className="mx-auto text-amber-500 dark:text-amber-400" />
            <p className="text-sm font-semibold text-surface-800 dark:text-surface-200">
              Link expired or already used
            </p>
            <p className="text-xs text-surface-500 dark:text-surface-400 leading-relaxed">
              Invite links can only be used once and expire after 24 hours.
              Ask your admin to send a new invite, or use <strong>Forgot password</strong> on the
              login page if you already have an account.
            </p>
            <Link href="/" className="btn-secondary text-sm inline-block mt-2">
              Back to login
            </Link>
          </div>
        )}

        {/* ── No session at all (no hash either) ── */}
        {!success && sessionReady === false && !hashPresent && (
          <div className="text-center py-6 space-y-3">
            <AlertCircle size={40} className="mx-auto text-amber-500 dark:text-amber-400" />
            <p className="text-sm font-semibold text-surface-800 dark:text-surface-200">
              Session not found
            </p>
            <p className="text-xs text-surface-500 dark:text-surface-400 leading-relaxed">
              Please use the link from your invitation email, or go back to the login page.
            </p>
            <Link href="/" className="btn-secondary text-sm inline-block mt-2">
              Back to login
            </Link>
          </div>
        )}

        {/* ── The actual password form ── */}
        {!success && sessionReady === true && (
          <>
            <h2 className="text-xl font-bold text-surface-900 dark:text-surface-100 text-center mb-1 font-display">
              Set your password
            </h2>
            <p className="text-sm text-surface-500 dark:text-surface-300 text-center mb-6">
              Choose a strong password to secure your account.
            </p>

            {error && (
              <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-500/40 flex items-start gap-2">
                <AlertCircle size={14} className="text-red-500 dark:text-red-400 mt-0.5 shrink-0" />
                <p className="text-xs text-red-700 dark:text-red-200">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label dark:text-surface-200">New password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="input pr-10 dark:bg-surface-700 dark:border-surface-600 dark:text-surface-100 dark:placeholder:text-surface-400"
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 dark:text-surface-300 hover:text-surface-600 dark:hover:text-surface-100"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="label dark:text-surface-200">Confirm password</label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  className="input dark:bg-surface-700 dark:border-surface-600 dark:text-surface-100 dark:placeholder:text-surface-400"
                  placeholder="Re-enter your password"
                  autoComplete="new-password"
                  required
                />
                {confirm && confirm !== password && (
                  <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Saving…
                  </>
                ) : (
                  'Set Password & Continue'
                )}
              </button>
            </form>

            <p className="text-center mt-4">
              <Link href="/" className="text-xs text-brand-600 dark:text-brand-400 hover:underline">
                Back to login
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}