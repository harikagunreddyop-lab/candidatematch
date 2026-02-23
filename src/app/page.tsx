'use client';
import { useState } from 'react';
import Image from 'next/image';
import { createClient } from '@/lib/supabase-browser';
import {
  Sparkles, Shield, Zap, Eye, EyeOff,
  AlertCircle, CheckCircle2, User, Briefcase, Mail, ArrowRight,
} from 'lucide-react';

type AuthMode = 'login' | 'signup' | 'forgot';
type SignupRole = 'candidate' | 'recruiter';

// LinkedIn SVG icon
function LinkedInIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="#0A66C2">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
    </svg>
  );
}

// Google SVG icon
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"/>
      <path fill="#FBBC05" d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332Z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58Z"/>
    </svg>
  );
}

export default function HomePage() {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [signupRole, setSignupRole] = useState<SignupRole>('recruiter');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<'google' | 'linkedin' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const supabase = createClient();

  const reset = () => { setError(null); setSuccess(null); };

  // Use the production URL (from env) so OAuth/invite/reset emails always
  // point to the deployed app, never to localhost.
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || window.location.origin).replace(/\/$/, '');

  // ── OAuth ─────────────────────────────────────────────────────────────────
  const handleOAuth = async (provider: 'google' | 'linkedin_oidc') => {
    reset();
    setOauthLoading(provider === 'google' ? 'google' : 'linkedin');
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${appUrl}/auth/callback`,
        queryParams: provider === 'linkedin_oidc' ? { scope: 'openid email profile' } : undefined,
      },
    });
    if (err) {
      setError(err.message);
      setOauthLoading(null);
    }
    // On success, browser redirects automatically — no need to clear loading
  };

  // ── Email login ───────────────────────────────────────────────────────────
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    reset();
    if (!email || !password) { setError('Email and password are required'); return; }
    setLoading(true);

    const { error: err } = await supabase.auth.signInWithPassword({ email, password });

    if (err) {
      if (err.message.includes('Invalid login')) setError('Invalid email or password. Check your credentials and try again.');
      else if (err.message.includes('Email not confirmed')) setError('Please confirm your email before logging in. Check your inbox.');
      else setError(err.message);
      setLoading(false);
      return;
    }

    window.location.href = '/dashboard';
  };

  // ── Email signup ──────────────────────────────────────────────────────────
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    reset();

    if (!fullName.trim()) { setError('Full name is required'); return; }
    if (!email) { setError('Email is required'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (!/[A-Z]/.test(password)) { setError('Password must contain at least one uppercase letter'); return; }
    if (!/[0-9]/.test(password)) { setError('Password must contain at least one number'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }

    setLoading(true);

    const { data, error: err } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName.trim(),
          name: fullName.trim(),
          signup_role: signupRole,
        },
        emailRedirectTo: `${appUrl}/auth/callback`,
      },
    });

    if (err) {
      if (err.message.includes('already registered')) setError('This email is already registered. Sign in instead.');
      else setError(err.message);
      setLoading(false);
      return;
    }

    if (data.session) {
      // Email confirmation disabled — logged in immediately
      window.location.href = '/dashboard';
      return;
    }

    // Email confirmation enabled
    setSuccess('Account created! Check your email to confirm your account, then sign in.');
    setMode('login');
    setLoading(false);
  };

  // ── Forgot password ───────────────────────────────────────────────────────
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    reset();
    if (!email) { setError('Enter your email address'); return; }
    setLoading(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${appUrl}/auth/reset-password`,
    });
    if (err) { setError(err.message); setLoading(false); return; }
    setSuccess('Password reset link sent. Check your email.');
    setLoading(false);
  };

  const passwordStrength = (pw: string) => {
    if (!pw) return null;
    let score = 0;
    if (pw.length >= 8) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    if (pw.length >= 12) score++;
    if (score <= 2) return { label: 'Weak', color: 'bg-red-400', width: '33%' };
    if (score <= 3) return { label: 'Fair', color: 'bg-yellow-400', width: '66%' };
    return { label: 'Strong', color: 'bg-green-400', width: '100%' };
  };

  const strength = mode === 'signup' ? passwordStrength(password) : null;

  return (
    <div className="min-h-screen flex bg-surface-50 dark:bg-surface-900">
      {/* One section: left half = logo, right half = login box */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 min-h-screen">
        {/* Left half — Matte black with Orion-path gradient, stars/crystals, meaning */}
        <div
          className="relative flex items-center justify-center px-6 py-12 overflow-hidden min-h-[50vh] md:min-h-0"
          style={{
            background: 'linear-gradient(140deg, #0a0a0a 0%, #0f0f0f 35%, #0c0c0c 50%, #080808 70%, #0a0a0a 100%)',
          }}
        >
          {/* Shiny black stars & crystals (decorative) */}
          <div className="absolute inset-0 pointer-events-none" aria-hidden>
            {/* Stars — dark with a tiny highlight */}
            <div className="absolute w-1.5 h-1.5 rounded-full bg-neutral-900 border border-neutral-600/60 shadow-[0_0_6px_0_rgba(255,255,255,0.15),inset_-0.5px_-0.5px_0_0_rgba(255,255,255,0.08)] top-[18%] left-[22%]" />
            <div className="absolute w-2 h-2 rounded-full bg-neutral-900 border border-neutral-500/50 shadow-[0_0_8px_0_rgba(255,255,255,0.2),inset_-0.5px_-0.5px_0_0_rgba(255,255,255,0.1)] top-[28%] right-[28%]" />
            <div className="absolute w-1 h-1 rounded-full bg-black border border-neutral-600/50 shadow-[0_0_4px_0_rgba(255,255,255,0.12)] top-[12%] right-[18%]" />
            <div className="absolute w-1.5 h-1.5 rounded-full bg-neutral-900 border border-neutral-600/50 shadow-[0_0_5px_0_rgba(255,255,255,0.12),inset_0_0_1px_0_rgba(255,255,255,0.1)] bottom-[32%] left-[15%]" />
            <div className="absolute w-2 h-2 rounded-full bg-neutral-900 border border-neutral-500/60 shadow-[0_0_7px_0_rgba(255,255,255,0.18),inset_-0.5px_-0.5px_0_0_rgba(255,255,255,0.08)] bottom-[22%] right-[20%]" />
            <div className="absolute w-1 h-1 rounded-full bg-black shadow-[0_0_4px_0_rgba(255,255,255,0.1)] bottom-[38%] right-[32%]" />
            <div className="absolute w-1.5 h-1.5 rounded-full bg-neutral-900 border border-neutral-600/40 shadow-[0_0_5px_0_rgba(255,255,255,0.1)] top-[42%] left-[12%]" />
            <div className="absolute w-1 h-1 rounded-full bg-neutral-900 shadow-[0_0_4px_0_rgba(255,255,255,0.08)] top-[55%] right-[14%]" />
            {/* Crystals — dark facets with a hint of edge shine */}
            <div className="absolute w-2.5 h-2.5 rotate-45 bg-gradient-to-br from-neutral-700/80 to-neutral-900 border border-neutral-600/50 shadow-[0_0_4px_0_rgba(255,255,255,0.06)] top-[24%] left-[35%]" />
            <div className="absolute w-2 h-2 rotate-[30deg] bg-gradient-to-br from-neutral-600/70 to-neutral-900 border border-neutral-500/40 top-[35%] right-[38%]" />
            <div className="absolute w-2 h-2 -rotate-12 bg-gradient-to-br from-neutral-700/60 to-neutral-900 border border-neutral-600/40 bottom-[45%] right-[25%]" />
            <div className="absolute w-2 h-2 rotate-45 bg-gradient-to-br from-neutral-600/80 to-neutral-900 border border-neutral-500/50 bottom-[28%] left-[28%]" />
            <div className="absolute w-1.5 h-1.5 rotate-12 bg-gradient-to-br from-neutral-600/70 to-neutral-900 border border-neutral-600/50 top-[60%] left-[20%]" />
          </div>

          <div className="relative flex flex-col items-center justify-center text-center max-w-sm">
            <div
              className="relative flex items-center justify-center rounded-2xl p-1"
              style={{
                boxShadow: '0 0 32px rgba(96, 165, 250, 0.35), 0 0 64px rgba(96, 165, 250, 0.2), 0 0 0 1px rgba(96, 165, 250, 0.2)',
              }}
            >
              <Image
                src="/logo.png"
                alt="Orion CMOS"
                width={280}
                height={280}
                className="object-contain w-44 h-44 sm:w-56 sm:h-56 md:w-64 md:h-64 rounded-2xl"
              />
            </div>
            <h1 className="mt-5 text-2xl sm:text-3xl font-bold text-white font-display tracking-tight">
              Orion CMOS
            </h1>
            <p className="mt-1 text-sm text-neutral-500 font-medium">AI-powered recruitment platform</p>
            <p className="mt-6 text-xs text-neutral-600 leading-relaxed">
              <span className="text-neutral-500 font-medium">Orion path</span> — like the constellation that guides the way: we light the path between talent and the right opportunity.
            </p>
          </div>
        </div>

        {/* Right half — Login box (same matte black Orion-path background) */}
        <div
          className="flex items-center justify-center px-4 sm:px-8 lg:px-12 py-12 min-h-[50vh] md:min-h-0"
          style={{
            background: 'linear-gradient(140deg, #0a0a0a 0%, #0f0f0f 35%, #0c0c0c 50%, #080808 70%, #0a0a0a 100%)',
          }}
        >
          <div className="w-full max-w-md">
            <div className="card p-5 sm:p-8 dark:bg-surface-800 dark:border-surface-600 dark:text-surface-100 shadow-xl border border-surface-200 dark:border-surface-700">
          <h2 className="text-lg sm:text-xl font-bold text-surface-900 dark:text-white text-center mb-1 font-display">
            {mode === 'login' ? 'Welcome back' : mode === 'signup' ? 'Create your account' : 'Reset your password'}
          </h2>
          <p className="text-xs sm:text-sm text-surface-500 dark:text-surface-300 text-center mb-4">
            {mode === 'login' ? 'Sign in to continue to your dashboard'
            : mode === 'signup' ? 'Join as a candidate or recruiter'
            : "We'll send you a secure reset link"}
          </p>

          {/* Alerts */}
          {error && (
            <div className="mb-5 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-500/40 flex items-start gap-2">
              <AlertCircle size={14} className="text-red-500 dark:text-red-400 mt-0.5 shrink-0" />
              <p className="text-xs text-red-700 dark:text-red-200">{error}</p>
            </div>
          )}
          {success && (
            <div className="mb-5 px-4 py-3 rounded-xl bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-500/40 flex items-start gap-2">
              <CheckCircle2 size={14} className="text-green-500 dark:text-green-400 mt-0.5 shrink-0" />
              <p className="text-xs text-green-700 dark:text-green-200">{success}</p>
            </div>
          )}

          {/* ── LOGIN ── */}
          {mode === 'login' && (
            <>
              {/* OAuth buttons */}
              <div className="space-y-2.5 mb-5">
                <button
                  onClick={() => handleOAuth('google')}
                  disabled={!!oauthLoading}
                  className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white dark:bg-surface-700 border border-surface-300 dark:border-surface-600 rounded-xl text-sm font-medium text-surface-700 dark:text-surface-100 hover:bg-surface-50 dark:hover:bg-surface-600 hover:border-surface-400 dark:hover:border-surface-500 transition-all shadow-sm disabled:opacity-60"
                >
                  {oauthLoading === 'google' ? <span className="w-4 h-4 border-2 border-surface-300 border-t-brand-500 rounded-full animate-spin" /> : <GoogleIcon />}
                  Continue with Google
                </button>
                <button
                  onClick={() => handleOAuth('linkedin_oidc')}
                  disabled={!!oauthLoading}
                  className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white dark:bg-surface-700 border border-surface-300 dark:border-surface-600 rounded-xl text-sm font-medium text-surface-700 dark:text-surface-100 hover:bg-surface-50 dark:hover:bg-surface-600 hover:border-surface-400 dark:hover:border-surface-500 transition-all shadow-sm disabled:opacity-60"
                >
                  {oauthLoading === 'linkedin' ? <span className="w-4 h-4 border-2 border-surface-300 border-t-[#0A66C2] rounded-full animate-spin" /> : <LinkedInIcon />}
                  Continue with LinkedIn
                </button>
              </div>

              <div className="flex items-center gap-4 mb-5">
                <div className="flex-1 h-px bg-surface-200 dark:bg-surface-600" />
                <span className="text-xs text-surface-400 dark:text-surface-400 font-medium">or sign in with email</span>
                <div className="flex-1 h-px bg-surface-200 dark:bg-surface-600" />
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="label text-xs dark:text-surface-200">Email address</label>
                  <input type="email" value={email} onChange={e => { setEmail(e.target.value); reset(); }}
                    className="input text-sm dark:bg-surface-700 dark:border-surface-600 dark:text-surface-100 dark:placeholder:text-surface-400" placeholder="you@example.com" required autoComplete="email" />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="label text-xs mb-0 dark:text-surface-200">Password</label>
                    <button type="button" onClick={() => { setMode('forgot'); reset(); }}
                      className="text-xs text-brand-600 dark:text-brand-400 hover:underline">Forgot password?</button>
                  </div>
                  <div className="relative">
                    <input type={showPassword ? 'text' : 'password'} value={password}
                      onChange={e => { setPassword(e.target.value); reset(); }}
                      className="input text-sm pr-10 dark:bg-surface-700 dark:border-surface-600 dark:text-surface-100 dark:placeholder:text-surface-400" placeholder="••••••••" required autoComplete="current-password" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 dark:text-surface-400 hover:text-surface-600 dark:hover:text-surface-200">
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <button type="submit" disabled={loading}
                  className="btn-primary w-full text-sm flex items-center justify-center gap-2">
                  {loading
                    ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Signing in...</>
                    : <><ArrowRight size={15} />Sign In</>}
                </button>
              </form>

              <p className="mt-5 text-center text-xs text-surface-500 dark:text-surface-400">
                Don't have an account?{' '}
                <button onClick={() => { setMode('signup'); reset(); setPassword(''); }}
                  className="text-brand-600 dark:text-brand-400 font-medium hover:underline">Create one</button>
              </p>
            </>
          )}

          {/* ── SIGNUP ── */}
          {mode === 'signup' && (
            <>
              {/* OAuth */}
              <div className="space-y-2.5 mb-5">
                <button onClick={() => handleOAuth('google')} disabled={!!oauthLoading}
                  className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white dark:bg-surface-700 border border-surface-300 dark:border-surface-600 rounded-xl text-sm font-medium text-surface-700 dark:text-surface-100 hover:bg-surface-50 dark:hover:bg-surface-600 hover:border-surface-400 dark:hover:border-surface-500 transition-all shadow-sm disabled:opacity-60">
                  {oauthLoading === 'google' ? <span className="w-4 h-4 border-2 border-surface-300 border-t-brand-500 rounded-full animate-spin" /> : <GoogleIcon />}
                  Sign up with Google
                </button>
                <button onClick={() => handleOAuth('linkedin_oidc')} disabled={!!oauthLoading}
                  className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white dark:bg-surface-700 border border-surface-300 dark:border-surface-600 rounded-xl text-sm font-medium text-surface-700 dark:text-surface-100 hover:bg-surface-50 dark:hover:bg-surface-600 hover:border-surface-400 dark:hover:border-surface-500 transition-all shadow-sm disabled:opacity-60">
                  {oauthLoading === 'linkedin' ? <span className="w-4 h-4 border-2 border-surface-300 border-t-[#0A66C2] rounded-full animate-spin" /> : <LinkedInIcon />}
                  Sign up with LinkedIn
                </button>
              </div>

              <div className="flex items-center gap-4 mb-5">
                <div className="flex-1 h-px bg-surface-200 dark:bg-surface-600" />
                <span className="text-xs text-surface-400 dark:text-surface-400 font-medium">or sign up with email</span>
                <div className="flex-1 h-px bg-surface-200 dark:bg-surface-600" />
              </div>

              <form onSubmit={handleSignup} className="space-y-4">
                {/* Role: only Recruiter can self-signup; candidates join by invite */}
                <div>
                  <label className="label text-xs mb-2 dark:text-surface-200">I am joining as</label>
                  <div className="grid grid-cols-1 gap-3">
                    <button type="button" onClick={() => setSignupRole('recruiter')}
                      className={`p-3 rounded-xl border-2 text-left transition-all ${
                        signupRole === 'recruiter'
                          ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/20 dark:border-brand-400'
                          : 'border-surface-200 dark:border-surface-600 hover:border-surface-300 dark:hover:border-surface-500 bg-white dark:bg-surface-700'
                      }`}>
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center mb-2 ${
                        signupRole === 'recruiter' ? 'bg-brand-100 dark:bg-brand-500/30 text-brand-600 dark:text-brand-300' : 'bg-surface-100 dark:bg-surface-600 text-surface-400 dark:text-surface-300'
                      }`}><Briefcase size={16} /></div>
                      <p className="text-sm font-semibold text-surface-700 dark:text-surface-200">Recruiter</p>
                      <p className="text-[11px] text-surface-400 dark:text-surface-400">Hiring talent — sign up here</p>
                    </button>
                  </div>
                  <p className="mt-2 text-[11px] text-surface-500 dark:text-surface-400 flex items-center gap-1.5">
                    <User size={12} className="shrink-0" />
                    Candidates join by invite only. Contact your admin to receive an invite and set your password via email.
                  </p>
                </div>

                <div>
                  <label className="label text-xs dark:text-surface-200">Full Name</label>
                  <input type="text" value={fullName} onChange={e => { setFullName(e.target.value); reset(); }}
                    className="input text-sm dark:bg-surface-700 dark:border-surface-600 dark:text-surface-100 dark:placeholder:text-surface-400" placeholder="Jane Smith" required autoComplete="name" />
                </div>

                <div>
                  <label className="label text-xs dark:text-surface-200">Email address</label>
                  <input type="email" value={email} onChange={e => { setEmail(e.target.value); reset(); }}
                    className="input text-sm dark:bg-surface-700 dark:border-surface-600 dark:text-surface-100 dark:placeholder:text-surface-400" placeholder="you@example.com" required autoComplete="email" />
                </div>

                <div>
                  <label className="label text-xs dark:text-surface-200">Password</label>
                  <div className="relative">
                    <input type={showPassword ? 'text' : 'password'} value={password}
                      onChange={e => { setPassword(e.target.value); reset(); }}
                      className="input text-sm pr-10 dark:bg-surface-700 dark:border-surface-600 dark:text-surface-100 dark:placeholder:text-surface-400"
                      placeholder="Min 8 chars, 1 uppercase, 1 number"
                      required minLength={8} autoComplete="new-password" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 dark:text-surface-400 hover:text-surface-600 dark:hover:text-surface-200">
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {/* Password strength bar */}
                  {strength && (
                    <div className="mt-2">
                      <div className="h-1 bg-surface-100 dark:bg-surface-600 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${strength.color}`} style={{ width: strength.width }} />
                      </div>
                      <p className={`text-[11px] mt-1 ${
                        strength.label === 'Strong' ? 'text-green-600 dark:text-green-400' :
                        strength.label === 'Fair' ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-500 dark:text-red-400'
                      }`}>{strength.label} password</p>
                    </div>
                  )}
                </div>

                <div>
                  <label className="label text-xs dark:text-surface-200">Confirm Password</label>
                  <div className="relative">
                    <input type={showConfirm ? 'text' : 'password'} value={confirmPassword}
                      onChange={e => { setConfirmPassword(e.target.value); reset(); }}
                      className={`input text-sm pr-10 dark:bg-surface-700 dark:border-surface-600 dark:text-surface-100 dark:placeholder:text-surface-400 ${confirmPassword && confirmPassword !== password ? 'border-red-300 dark:border-red-500/50 focus:ring-red-200' : ''}`}
                      placeholder="••••••••" required autoComplete="new-password" />
                    <button type="button" onClick={() => setShowConfirm(!showConfirm)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 dark:text-surface-400 hover:text-surface-600 dark:hover:text-surface-200">
                      {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {confirmPassword && confirmPassword !== password && (
                    <p className="text-[11px] text-red-500 mt-1">Passwords do not match</p>
                  )}
                </div>

                <button type="submit" disabled={loading}
                  className="btn-primary w-full text-sm flex items-center justify-center gap-2">
                  {loading
                    ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Creating account...</>
                    : <><ArrowRight size={15} />Create Account</>}
                </button>
              </form>

              <p className="mt-5 text-center text-xs text-surface-500 dark:text-surface-400">
                Already have an account?{' '}
                <button onClick={() => { setMode('login'); reset(); setPassword(''); setConfirmPassword(''); }}
                  className="text-brand-600 dark:text-brand-400 font-medium hover:underline">Sign in</button>
              </p>
            </>
          )}

          {/* ── FORGOT PASSWORD ── */}
          {mode === 'forgot' && (
            <>
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div>
                  <label className="label text-xs dark:text-surface-200">Email address</label>
                  <input type="email" value={email} onChange={e => { setEmail(e.target.value); reset(); }}
                    className="input text-sm dark:bg-surface-700 dark:border-surface-600 dark:text-surface-100 dark:placeholder:text-surface-400" placeholder="you@example.com" required autoComplete="email" />
                </div>
                <button type="submit" disabled={loading}
                  className="btn-primary w-full text-sm flex items-center justify-center gap-2">
                  {loading
                    ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Sending...</>
                    : <><Mail size={15} />Send Reset Link</>}
                </button>
              </form>
              <p className="mt-5 text-center text-xs text-surface-500 dark:text-surface-400">
                <button onClick={() => { setMode('login'); reset(); }}
                  className="text-brand-600 dark:text-brand-400 font-medium hover:underline">← Back to sign in</button>
              </p>
            </>
          )}
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}