'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase-browser';

const NEGOTIATION_TIPS = [
  { id: '1', text: 'Anchor high: state your desired range first when possible, based on market data.' },
  { id: '2', text: 'Use exact numbers (e.g. $127,000) to signal preparation and confidence.' },
  { id: '3', text: 'Consider total comp: equity, bonus, and benefits can add 15–30%.' },
  { id: '4', text: 'Ask for 24–48 hours to consider an offer before responding.' },
  { id: '5', text: 'Get the offer in writing before discussing or accepting.' },
];

function Factor({ label, impact }: { label: string; impact: string }) {
  return (
    <div className="rounded-lg bg-surface-100 dark:bg-surface-900 p-3 flex items-center justify-between">
      <span className="text-sm text-surface-600 dark:text-surface-400">{label}</span>
      <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">{impact}</span>
    </div>
  );
}

export default function SalaryIntelligencePage() {
  const supabase = createClient();
  const [title, setTitle] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const avg = 125000;
  const low = 100000;
  const high = 150000;

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }
      const { data: c } = await supabase.from('candidates').select('primary_title').eq('user_id', session.user.id).single();
      if (c?.primary_title) setTitle(c.primary_title);
      setLoading(false);
    })();
  }, [supabase]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-violet-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold text-surface-900 dark:text-white">Salary Intelligence</h1>
      <div className="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800 p-6">
        <h2 className="text-xl font-semibold text-surface-900 dark:text-white mb-4">Your market value</h2>
        {title && <p className="text-sm text-surface-500 dark:text-surface-400 mb-4">Role: {title}</p>}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-surface-500 dark:text-surface-400">Average</span>
            <span className="text-2xl font-bold text-surface-900 dark:text-white">${(avg / 1000).toFixed(0)}K</span>
          </div>
          <div className="relative h-12 bg-surface-200 dark:bg-surface-900 rounded-lg overflow-hidden">
            <div className="absolute inset-y-0 left-[20%] right-[20%] bg-gradient-to-r from-emerald-500/20 to-blue-500/20" />
            <div className="absolute top-1/2 left-[50%] w-1 h-full bg-violet-500 -translate-y-1/2" />
          </div>
          <div className="flex justify-between mt-2 text-sm text-surface-500 dark:text-surface-400">
            <span>${(low / 1000).toFixed(0)}K (25th)</span>
            <span>${(high / 1000).toFixed(0)}K (75th)</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Factor label="Experience" impact="+$15K" />
          <Factor label="Location" impact="+$20K" />
          <Factor label="Skills" impact="+$10K" />
          <Factor label="Education" impact="+$5K" />
        </div>
      </div>
      <div className="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800 p-6">
        <h3 className="text-lg font-semibold text-surface-900 dark:text-white mb-4">Negotiation strategies</h3>
        <div className="space-y-3">
          {NEGOTIATION_TIPS.map((tip) => (
            <div key={tip.id} className="flex items-start gap-3 p-3 bg-surface-100 dark:bg-surface-900 rounded-lg">
              <span className="text-violet-500 dark:text-violet-400 shrink-0">💡</span>
              <p className="text-sm text-surface-700 dark:text-surface-300">{tip.text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
