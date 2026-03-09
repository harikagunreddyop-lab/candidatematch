'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Mail, Lock, User, Briefcase } from 'lucide-react';
import { createClient } from '@/lib/supabase-browser';
import {
  FloatingInput,
  ProgressDot,
  StatCard,
  FloatingOrbs,
  RoleCard,
  EmailVerification,
} from '@/components/auth';
import { getPublicAppUrl } from '@/lib/public-app-url';

function getAppUrlWithFallback(): string {
  return getPublicAppUrl();
}

type SignupRole = 'candidate' | 'company';
type SignupStep = 'role' | 'details' | 'verify';

export default function SignupPage() {
  const [step, setStep] = useState<SignupStep>('role');
  const [role, setRole] = useState<SignupRole>('candidate');
  const [form, setForm] = useState({ email: '', password: '', name: '', company: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  const handleCreateAccount = async () => {
    setError(null);
    if (!form.name.trim()) {
      setError('Full name is required');
      return;
    }
    if (!form.email) {
      setError('Email is required');
      return;
    }
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (!/[A-Z]/.test(form.password)) {
      setError('Password must contain at least one uppercase letter');
      return;
    }
    if (!/[0-9]/.test(form.password)) {
      setError('Password must contain at least one number');
      return;
    }

    setLoading(true);
    const appUrl = getAppUrlWithFallback();
    const signupRole = role === 'company' ? 'recruiter' : 'candidate';

    const { data, error: err } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: {
          full_name: form.name.trim(),
          name: form.name.trim(),
          signup_role: signupRole,
          ...(role === 'company' && form.company.trim() ? { company_name: form.company.trim() } : {}),
        },
        emailRedirectTo: `${appUrl}/auth/callback`,
      },
    });

    setLoading(false);

    if (err) {
      if (err.message.includes('already registered')) {
        setError('That email is already registered. Sign in instead.');
      } else {
        setError(err.message);
      }
      return;
    }

    if (data.session) {
      window.location.href = '/auth/complete';
      return;
    }

    setStep('verify');
  };

  return (
    <div className="min-h-screen flex" style={{ background: 'linear-gradient(140deg, #080909 0%, #0a0d08 50%, #080909 100%)' }}>
      {/* Left Side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-center px-16 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-400/10 via-brand-500/5 to-transparent" />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="relative z-10"
        >
          <h1 className="text-6xl font-bold text-white mb-6 leading-tight">
            Your dream job
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-300 to-brand-500">
              is waiting
            </span>
          </h1>
          <p className="text-xl text-surface-400 mb-12">
            AI-powered matching • Elite resumes • Automated tracking
          </p>

          <div className="grid grid-cols-3 gap-8">
            <StatCard number="10,000+" label="Active Jobs" />
            <StatCard number="95%" label="Match Rate" />
            <StatCard number="<2min" label="Sign Up" />
          </div>
        </motion.div>
        <FloatingOrbs />
      </div>

      {/* Right Side - Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center px-8 py-12">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          <div className="bg-surface-800/50 backdrop-blur-xl border border-surface-700/60 rounded-2xl p-8 shadow-2xl">
            <div className="flex justify-center gap-2 mb-8">
              <ProgressDot active={step === 'role'} completed={step !== 'role'} />
              <ProgressDot active={step === 'details'} completed={step === 'verify'} />
              <ProgressDot active={step === 'verify'} />
            </div>

            {error && (
              <div className="mb-6 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-200 text-sm">
                {error}
              </div>
            )}

            {step === 'role' && (
              <RoleSelection
                selected={role}
                onSelect={setRole}
                onNext={() => setStep('details')}
              />
            )}

            {step === 'details' && (
              <DetailsForm
                role={role}
                form={form}
                onChange={setForm}
                onBack={() => setStep('role')}
                onSubmit={handleCreateAccount}
                loading={loading}
              />
            )}

            {step === 'verify' && <EmailVerification email={form.email} />}

            {step !== 'verify' && (
              <div className="mt-6 text-center text-sm text-surface-400">
                Already have an account?{' '}
                <Link href="/auth/login" className="text-brand-400 hover:text-brand-300 font-semibold">
                  Sign in
                </Link>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function RoleSelection({
  selected,
  onSelect,
  onNext,
}: {
  selected: SignupRole;
  onSelect: (r: SignupRole) => void;
  onNext: () => void;
}) {
  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
      <h2 className="text-3xl font-bold text-white mb-2">Welcome to CandidateMatch</h2>
      <p className="text-surface-400 mb-8">Choose how you&apos;ll use the platform</p>

      <div className="space-y-4">
        <RoleCard
          icon={<User className="w-6 h-6" />}
          title="I'm looking for a job"
          description="Find your dream role with AI-powered matching"
          selected={selected === 'candidate'}
          onClick={() => onSelect('candidate')}
        />
        <RoleCard
          icon={<Briefcase className="w-6 h-6" />}
          title="I'm hiring talent"
          description="Post jobs and find top candidates"
          selected={selected === 'company'}
          onClick={() => onSelect('company')}
        />
      </div>

      <button
        type="button"
        onClick={onNext}
        className="w-full mt-8 px-6 py-3 bg-brand-400 hover:bg-brand-300 text-[#0a0f00] rounded-xl font-semibold shadow-lime hover:shadow-lime-lg transition-all"
      >
        Continue
      </button>
    </motion.div>
  );
}

function DetailsForm({
  role,
  form,
  onChange,
  onBack,
  onSubmit,
  loading,
}: {
  role: SignupRole;
  form: { email: string; password: string; name: string; company: string };
  onChange: (f: typeof form) => void;
  onBack: () => void;
  onSubmit: () => void;
  loading: boolean;
}) {
  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
      <h2 className="text-3xl font-bold text-white mb-2">Create your account</h2>
      <p className="text-surface-400 mb-8">
        Join thousands of {role === 'candidate' ? 'job seekers' : 'employers'}
      </p>

      <div className="space-y-4">
        <FloatingInput
          icon={<User className="w-5 h-5" />}
          placeholder="Full Name"
          value={form.name}
          onChange={(e) => onChange({ ...form, name: e.target.value })}
        />

        {role === 'company' && (
          <FloatingInput
            icon={<Briefcase className="w-5 h-5" />}
            placeholder="Company Name"
            value={form.company}
            onChange={(e) => onChange({ ...form, company: e.target.value })}
          />
        )}

        <FloatingInput
          icon={<Mail className="w-5 h-5" />}
          type="email"
          placeholder="Email Address"
          value={form.email}
          onChange={(e) => onChange({ ...form, email: e.target.value })}
        />

        <FloatingInput
          icon={<Lock className="w-5 h-5" />}
          type="password"
          placeholder="Password (min 8 chars, 1 uppercase, 1 number)"
          value={form.password}
          onChange={(e) => onChange({ ...form, password: e.target.value })}
          minLength={8}
        />
      </div>

      <div className="flex gap-3 mt-8">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 px-6 py-3 bg-surface-700 hover:bg-surface-600 text-white rounded-xl font-semibold transition-all"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={loading}
          className="flex-1 px-6 py-3 bg-brand-400 hover:bg-brand-300 disabled:opacity-70 text-[#0a0f00] rounded-xl font-semibold shadow-lime hover:shadow-lime-lg transition-all flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Creating…
            </>
          ) : (
            'Create Account'
          )}
        </button>
      </div>

      <p className="text-xs text-surface-500 mt-6 text-center">
        By signing up, you agree to our{' '}
        <Link href="/terms" className="text-brand-400 hover:underline">
          Terms of Service
        </Link>{' '}
        and{' '}
        <Link href="/privacy" className="text-brand-400 hover:underline">
          Privacy Policy
        </Link>
      </p>
    </motion.div>
  );
}
