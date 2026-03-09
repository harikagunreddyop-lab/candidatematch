'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase-browser';
import Link from 'next/link';
import { AlertCircle, CheckCircle, Lightbulb, FileSearch, User, BarChart2 } from 'lucide-react';
import { cn } from '@/utils/helpers';
import SkillReportTabContent from '@/components/candidate/SkillReportTabContent';

type Tab = 'gap' | 'report' | 'recommendations';

export default function SkillsPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>('gap');
  const [skills, setSkills] = useState<string[]>([]);
  const [missing, setMissing] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setLoading(false);
        return;
      }
      const { data: c } = await supabase.from('candidates').select('skills, tools').eq('user_id', session.user.id).single();
      const mine = [...(c?.skills || []), ...(c?.tools || [])].slice(0, 12);
      setSkills(mine);
      setMissing(['Kubernetes', 'System design', 'Mentorship']);
      setLoading(false);
    })();
  }, [supabase]);

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'gap', label: 'Gap Analysis', icon: <AlertCircle size={16} /> },
    { id: 'report', label: 'Skill Report', icon: <BarChart2 size={16} /> },
    { id: 'recommendations', label: 'Recommendations', icon: <Lightbulb size={16} /> },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="rounded-2xl border border-surface-300 bg-surface-100 p-4">
        <h1 className="text-2xl font-bold text-surface-900">Skills & report</h1>
        <p className="text-surface-600 text-sm mt-1">Skills matrix, gap signals, and ATS skill report in one place.</p>
      </div>

      <div className="flex gap-1 p-1 rounded-xl bg-surface-100 border border-surface-300 w-fit">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              tab === t.id
                ? 'bg-surface-200 text-surface-900 shadow-sm'
                : 'text-surface-600 hover:text-surface-900'
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'gap' && (
        <>
          {loading ? (
            <div className="flex justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-400 border-t-transparent" />
            </div>
          ) : (
            <>
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="rounded-xl border border-surface-300 bg-surface-100 p-6">
                  <h2 className="text-lg font-semibold text-surface-900 mb-4 flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-emerald-500" /> Your skills
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    {skills.length ? (
                      skills.map((s, i) => (
                        <span key={i} className="px-3 py-1 rounded-lg bg-emerald-500/10 text-emerald-700 text-sm">
                          {s}
                        </span>
                      ))
                    ) : (
                      <span className="text-surface-500">Add skills in your profile</span>
                    )}
                  </div>
                </div>
                <div className="rounded-xl border border-surface-300 bg-surface-100 p-6">
                  <h2 className="text-lg font-semibold text-surface-900 mb-4 flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-amber-500" /> Gaps to close
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    {missing.map((s, i) => (
                      <span key={i} className="px-3 py-1 rounded-lg bg-amber-500/10 text-amber-700 text-sm">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <Link href="/dashboard/candidate/profile" className="btn-primary inline-block">
                Update profile & skills
              </Link>
            </>
          )}
        </>
      )}

      {tab === 'report' && <SkillReportTabContent />}

      {tab === 'recommendations' && (
        <div className="rounded-xl border border-surface-300 bg-surface-100 p-6 space-y-6">
          <h2 className="text-lg font-semibold text-surface-900 flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-amber-500" /> Recommendations
          </h2>
          <ul className="space-y-4">
            <li className="flex items-start gap-3">
              <User className="w-5 h-5 text-violet-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-surface-900">Keep your profile skills updated</p>
                <p className="text-sm text-surface-600">Add tools and technologies you use so matches and ATS scores stay accurate.</p>
                <Link href="/dashboard/candidate/profile" className="text-sm text-brand-400 hover:text-brand-300 font-medium mt-1 inline-block">
                  Edit profile →
                </Link>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <FileSearch className="w-5 h-5 text-violet-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-surface-900">Run ATS check before applying</p>
                <p className="text-sm text-surface-600">See matched and missing keywords per job and improve your resume for that role.</p>
                <Link href="/dashboard/candidate/tools/ats-checker" className="text-sm text-brand-400 hover:text-brand-300 font-medium mt-1 inline-block">
                  ATS Checker →
                </Link>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <BarChart2 className="w-5 h-5 text-violet-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-surface-900">Review the Skill Report tab</p>
                <p className="text-sm text-surface-600">Profile analysis, resume analysis, and why roles score high or low — all in one place.</p>
                <button type="button" onClick={() => setTab('report')} className="text-sm text-brand-400 hover:text-brand-300 font-medium mt-1">
                  Open Skill Report →
                </button>
              </div>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
