'use client';
// Invite-only flow: candidate sees this until admin assigns a recruiter. No onboarding.
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { Spinner } from '@/components/ui';
import { Clock, UserPlus, Mail } from 'lucide-react';

export default function CandidateWaitingPage() {
  const supabase = createClient();
  const [name, setName] = useState('');
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: candidate } = await supabase
        .from('candidates')
        .select('full_name')
        .eq('user_id', user.id)
        .single();
      setName(candidate?.full_name?.split(' ')[0] || '');
    }
    init();
  }, []);

  // Poll for recruiter assignment — redirect to dashboard when assigned
  useEffect(() => {
    const interval = setInterval(async () => {
      setChecking(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: candidate } = await supabase
        .from('candidates')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!candidate) {
        setChecking(false);
        return;
      }

      const { count } = await supabase
        .from('recruiter_candidate_assignments')
        .select('recruiter_id', { count: 'exact', head: true })
        .eq('candidate_id', candidate.id);

      setChecking(false);

      if (count && count > 0) {
        window.location.href = '/dashboard/candidate';
      }
    }, 8000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-surface-50 via-white to-brand-50/30 dark:from-surface-900 dark:via-surface-900 dark:to-surface-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white dark:bg-surface-800 rounded-2xl shadow-xl border border-surface-200 dark:border-surface-700 p-8 text-center space-y-6">

        <div className="w-16 h-16 bg-amber-100 dark:bg-amber-500/20 rounded-2xl flex items-center justify-center mx-auto">
          <Clock size={28} className="text-amber-600 dark:text-amber-400" />
        </div>

        <div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-100 font-display">
            Welcome{name ? `, ${name}` : ''}
          </h1>
          <p className="text-sm text-surface-600 dark:text-surface-300 mt-2 leading-relaxed">
            You’ve been invited to the platform. An admin will assign you a recruiter shortly.
            Until then you cannot access your profile or other features.
          </p>
          <p className="text-sm text-surface-500 dark:text-surface-400 mt-2">
            Once a recruiter is assigned, this page will update automatically and you’ll get full access.
          </p>
        </div>

        <div className="flex items-center gap-3 justify-center rounded-xl bg-surface-50 dark:bg-surface-700/50 px-4 py-3 text-left">
          <UserPlus size={20} className="text-surface-500 dark:text-surface-400 shrink-0" />
          <div className="text-left">
            <p className="text-xs font-semibold text-surface-700 dark:text-surface-200">Waiting for recruiter assignment</p>
            <p className="text-[11px] text-surface-500 dark:text-surface-400">Admin will assign a recruiter to you. No action needed.</p>
          </div>
          {checking && <Spinner size={16} className="shrink-0 ml-auto" />}
        </div>

        <div className="flex items-center justify-center gap-2 text-xs text-surface-400 dark:text-surface-500">
          <Mail size={12} />
          <span>You’ll get full access as soon as a recruiter is assigned</span>
        </div>
      </div>
    </div>
  );
}
