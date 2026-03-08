'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { Users, Link2 } from 'lucide-react';

export default function NetworkStrengthPage() {
  const supabase = createClient();
  const [score, setScore] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }
      const { data: c } = await supabase.from('candidates').select('id').eq('user_id', session.user.id).single();
      if (!c) { setLoading(false); return; }
      const { count } = await supabase.from('applications').select('id', { count: 'exact', head: true }).eq('candidate_id', c.id);
      const { count: matches } = await supabase.from('candidate_job_matches').select('id', { count: 'exact', head: true }).eq('candidate_id', c.id).gte('fit_score', 70);
      const s = Math.min(100, 40 + (count || 0) * 3 + (matches || 0));
      setScore(s);
      setLoading(false);
    })();
  }, [supabase]);

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-400 border-t-transparent" /></div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold text-surface-900 dark:text-white">Network strength</h1>
      <p className="text-surface-500 dark:text-surface-400">Based on applications and strong matches.</p>
      <div className="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-100 p-8 text-center">
        <div className="inline-flex items-center justify-center w-32 h-32 rounded-full bg-brand-400/20 mb-4">
          <span className="text-4xl font-bold text-brand-400">{score}</span>
        </div>
        <h2 className="text-xl font-semibold text-surface-900 dark:text-white">Strength score</h2>
        <p className="text-sm text-surface-500 dark:text-surface-400 mt-2">Apply to more roles and improve match quality to raise your score.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-100 p-5 flex items-center gap-4">
          <Users className="w-10 h-10 text-brand-400 shrink-0" />
          <div>
            <h3 className="font-semibold text-surface-900 dark:text-white">Connections</h3>
            <p className="text-sm text-surface-500 dark:text-surface-400">Grow via applications & referrals</p>
          </div>
        </div>
        <div className="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-100 p-5 flex items-center gap-4">
          <Link2 className="w-10 h-10 text-emerald-500 shrink-0" />
          <div>
            <h3 className="font-semibold text-surface-900 dark:text-white">Referrals</h3>
            <p className="text-sm text-surface-500 dark:text-surface-400">Ask for intros to hiring managers</p>
          </div>
        </div>
      </div>
    </div>
  );
}
