'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { ChevronRight, Briefcase } from 'lucide-react';

const DEFAULT_STEPS = [
  { title: 'Current role', level: 'Mid-level', years: '2–5' },
  { title: 'Senior / Lead', level: 'Senior', years: '5–8' },
  { title: 'Staff / Principal', level: 'Staff', years: '8–12' },
  { title: 'Director / VP', level: 'Leadership', years: '12+' },
];

export default function CareerPathPage() {
  const supabase = createClient();
  const [currentTitle, setCurrentTitle] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }
      const { data: c } = await supabase.from('candidates').select('primary_title').eq('user_id', session.user.id).single();
      if (c?.primary_title) setCurrentTitle(c.primary_title);
      setLoading(false);
    })();
  }, [supabase]);

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-400 border-t-transparent" /></div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold text-surface-900 dark:text-white">Career path</h1>
      {currentTitle && <p className="text-surface-500 dark:text-surface-400">From {currentTitle} → next steps</p>}
      <div className="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-100 overflow-hidden">
        {DEFAULT_STEPS.map((step, i) => (
          <div
            key={i}
            className="flex items-center gap-4 p-5 border-b border-surface-200 dark:border-surface-700 last:border-0"
          >
            <div className="w-10 h-10 rounded-full bg-brand-400/20 flex items-center justify-center shrink-0">
              <Briefcase className="w-5 h-5 text-brand-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-surface-900 dark:text-white">{step.title}</h3>
              <p className="text-sm text-surface-500 dark:text-surface-400">{step.level} · {step.years} years</p>
            </div>
            <ChevronRight className="w-5 h-5 text-surface-400 shrink-0" />
          </div>
        ))}
      </div>
      <p className="text-sm text-surface-500 dark:text-surface-400">Tailor your resume and applications to align with the next step on your path.</p>
    </div>
  );
}
