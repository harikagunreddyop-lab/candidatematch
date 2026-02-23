'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { Spinner } from '@/components/ui';
import { Settings, Bell } from 'lucide-react';

function SendPasswordReset() {
  const supabase = createClient();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handleSend = async () => {
    setSending(true);
    setError(null);
    const { data: { session } } = await supabase.auth.getSession();
    const email = session?.user?.email;
    if (!email) {
      setError('No email on file');
      setSending(false);
      return;
    }
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/dashboard/candidate` : '',
    });
    if (err) setError(err.message);
    else setSent(true);
    setSending(false);
  };
  return (
    <div className="space-y-2">
      <button onClick={handleSend} disabled={sending || sent} className="btn-primary text-sm py-2 px-4">
        {sending ? <Spinner size={14} className="inline" /> : sent ? 'Check your email' : 'Send password reset email'}
      </button>
      {sent && <p className="text-xs text-emerald-600 dark:text-emerald-400">We sent a link to your email. Use it to set a new password.</p>}
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

export default function CandidateSettingsPage() {
  const [candidate, setCandidate] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notLinked, setNotLinked] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }
      const { data: cand } = await supabase.from('candidates').select('id').eq('user_id', session.user.id).single();
      if (!cand) setNotLinked(true);
      else setCandidate(cand);
      setLoading(false);
    })();
  }, [supabase]);

  if (loading) return <div className="flex justify-center py-20"><Spinner size={28} /></div>;
  if (notLinked) return (
    <div className="flex flex-col items-center justify-center py-24 gap-6 text-center px-4">
      <p className="text-sm text-surface-500 dark:text-surface-300">Your account isn&apos;t linked to a candidate profile yet. Contact your recruiter.</p>
    </div>
  );

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-xl font-bold text-surface-900 dark:text-surface-100 font-display">Account & preferences</h1>

      <div className="rounded-2xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-6 shadow-sm space-y-4">
        <h3 className="text-sm font-bold text-surface-900 dark:text-surface-100 font-display flex items-center gap-2">
          <Settings size={16} className="text-surface-500 dark:text-surface-400" /> Password
        </h3>
        <p className="text-sm text-surface-600 dark:text-surface-300">Send a password reset link to your email. You’ll set a new password from there.</p>
        <SendPasswordReset />
      </div>

      <div className="rounded-2xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-6 shadow-sm space-y-4">
        <h3 className="text-sm font-bold text-surface-900 dark:text-surface-100 font-display flex items-center gap-2">
          <Bell size={16} className="text-surface-500 dark:text-surface-400" /> Notifications
        </h3>
        <p className="text-sm text-surface-600 dark:text-surface-300">Email reminders for your follow-ups (e.g. when a reminder is due) can be enabled by your recruiter. In-app reminders are always available on the Reminders tab.</p>
      </div>
    </div>
  );
}
