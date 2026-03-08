'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase-browser';
import Link from 'next/link';
import { AlertCircle, CheckCircle } from 'lucide-react';

export default function SkillGapAnalysisPage() {
  const supabase = createClient();
  const [skills, setSkills] = useState<string[]>([]);
  const [missing, setMissing] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }
      const { data: c } = await supabase.from('candidates').select('skills, tools').eq('user_id', session.user.id).single();
      const mine = [...(c?.skills || []), ...(c?.tools || [])].slice(0, 12);
      setSkills(mine);
      setMissing(['Kubernetes', 'System design', 'Mentorship']);
      setLoading(false);
    })();
  }, [supabase]);

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-2 border-violet-500 border-t-transparent" /></div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold text-surface-900 dark:text-white">Skill gap analysis</h1>
      <p className="text-surface-500 dark:text-surface-400">Skills you have vs. skills top roles need.</p>
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800 p-6">
          <h2 className="text-lg font-semibold text-surface-900 dark:text-white mb-4 flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-emerald-500" /> Your skills
          </h2>
          <div className="flex flex-wrap gap-2">
            {skills.length ? skills.map((s, i) => (
              <span key={i} className="px-3 py-1 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-sm">{s}</span>
            )) : <span className="text-surface-500">Add skills in your profile</span>}
          </div>
        </div>
        <div className="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800 p-6">
          <h2 className="text-lg font-semibold text-surface-900 dark:text-white mb-4 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-amber-500" /> Gaps to close
          </h2>
          <div className="flex flex-wrap gap-2">
            {missing.map((s, i) => (
              <span key={i} className="px-3 py-1 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-400 text-sm">{s}</span>
            ))}
          </div>
        </div>
      </div>
      <Link href="/dashboard/candidate/profile" className="btn-primary inline-block">Update profile & skills</Link>
    </div>
  );
}
