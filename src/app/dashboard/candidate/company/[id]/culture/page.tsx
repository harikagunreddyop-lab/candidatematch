'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import Link from 'next/link';
import { ArrowLeft, Users, Zap, Target } from 'lucide-react';

export default function CompanyCulturePage() {
  const params = useParams();
  const id = params?.id as string;
  const supabase = createClient();
  const [company, setCompany] = useState<{ name: string; culture_summary?: string } | null>(null);
  const [insights, setInsights] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data: c } = await supabase.from('companies').select('id, name, description, industry, size_range').eq('id', id).single();
      if (c) setCompany({ name: c.name, culture_summary: c.description });
      setInsights(c?.description ? c.description.split(/[.•\n]/).filter(Boolean).slice(0, 6) : [
        'Values-driven and collaborative.',
        'Remote-friendly with core hours.',
        'Strong focus on growth and learning.',
      ]);
      setLoading(false);
    })();
  }, [id, supabase]);

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-2 border-violet-500 border-t-transparent" /></div>;
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Link href="/dashboard/candidate" className="inline-flex items-center gap-1 text-surface-500 hover:text-surface-700 dark:text-surface-400 dark:hover:text-surface-200 text-sm">
        <ArrowLeft size={16} /> Back
      </Link>
      <h1 className="text-3xl font-bold text-surface-900 dark:text-white">Company culture</h1>
      <p className="text-surface-500 dark:text-surface-400">{company?.name || 'Company'}</p>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800 p-5 flex items-start gap-3">
          <Users className="w-6 h-6 text-violet-500 shrink-0" />
          <div>
            <h3 className="font-semibold text-surface-900 dark:text-white">Team</h3>
            <p className="text-sm text-surface-500 dark:text-surface-400">Cross-functional, collaborative</p>
          </div>
        </div>
        <div className="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800 p-5 flex items-start gap-3">
          <Zap className="w-6 h-6 text-amber-500 shrink-0" />
          <div>
            <h3 className="font-semibold text-surface-900 dark:text-white">Pace</h3>
            <p className="text-sm text-surface-500 dark:text-surface-400">Fast-paced, iterative</p>
          </div>
        </div>
        <div className="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800 p-5 flex items-start gap-3">
          <Target className="w-6 h-6 text-emerald-500 shrink-0" />
          <div>
            <h3 className="font-semibold text-surface-900 dark:text-white">Mission</h3>
            <p className="text-sm text-surface-500 dark:text-surface-400">Impact and outcomes</p>
          </div>
        </div>
      </div>
      <div className="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800 p-6">
        <h2 className="text-lg font-semibold text-surface-900 dark:text-white mb-4">Culture insights</h2>
        <ul className="space-y-2">
          {insights.map((s, i) => (
            <li key={i} className="flex items-start gap-2 text-surface-600 dark:text-surface-300">
              <span className="text-violet-500">•</span> {s.trim()}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
