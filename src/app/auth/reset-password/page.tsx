'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { createClient } from '@/lib/supabase-browser';
import { Eye, EyeOff, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = createClient();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Give Supabase time to process the invite/recovery link and create a session
      for (let i = 0; i < 10; i++) {
        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled) return;
        if (session) return; // session ready, stay on this page
        await new Promise(r => setTimeout(r, 300));
      }
      if (!cancelled) router.replace('/?error=auth');
    })();
    return () => { cancelled = true; };
  }, [supabase, router]);

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
    // Password creation = acceptance of invite. Create/link candidate and set invite_accepted_at.
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      await fetch('/api/invite/accept-invite', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
    }
    setLoading(false);
    setSuccess(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: profile } = user ? await supabase.from('profiles').select('role').eq('id', user.id).single() : { data: null };
    const dest = profile?.role === 'admin' ? '/dashboard/admin' : profile?.role === 'recruiter' ? '/dashboard/recruiter' : '/dashboard/candidate';
    setTimeout(() => {
      router.push(dest);
      router.refresh();
    }, 1500);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-surface-50 dark:bg-surface-900 px-4">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-12 h-12 rounded-2xl overflow-hidden bg-white dark:bg-surface-800 flex items-center justify-center shadow-lg shadow-brand-500/25 border border-surface-200 dark:border-surface-600">
          <Image src="/logo.png" alt="Logo" width={48} height={48} className="object-contain" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-100 font-display tracking-tight">Orion CMOS</h1>
          <p className="text-xs text-surface-500 dark:text-surface-300 font-medium tracking-wide uppercase">Set new password</p>
        </div>
      </div>
      <div className="card p-8 max-w-md w-full dark:bg-surface-800 dark:border-surface-600">
        {success ? (
          <div className="text-center py-4">
            <CheckCircle2 size={48} className="mx-auto text-green-500 dark:text-green-400 mb-3" />
            <p className="text-sm font-medium text-green-800 dark:text-green-200">Password updated. Redirecting to dashboard...</p>
          </div>
        ) : (
          <>
            <h2 className="text-xl font-bold text-surface-900 dark:text-surface-100 text-center mb-1 font-display">Set new password</h2>
            <p className="text-sm text-surface-500 dark:text-surface-300 text-center mb-6">Enter and confirm your new password below.</p>
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
                    onChange={(e) => setPassword(e.target.value)}
                    className="input pr-10 dark:bg-surface-700 dark:border-surface-600 dark:text-surface-100 dark:placeholder:text-surface-400"
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                    minLength={8}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
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
                  onChange={(e) => setConfirm(e.target.value)}
                  className="input dark:bg-surface-700 dark:border-surface-600 dark:text-surface-100 dark:placeholder:text-surface-400"
                  placeholder="Confirm new password"
                  autoComplete="new-password"
                />
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? 'Updating...' : 'Update password'}
              </button>
            </form>
            <p className="text-center mt-4">
              <Link href="/" className="text-xs text-brand-600 dark:text-brand-400 hover:underline">Back to login</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
