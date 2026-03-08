'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-browser';
import { EmptyState } from '@/components/ui';
import { Calendar, MapPin, ExternalLink, Briefcase } from 'lucide-react';
import { cn } from '@/utils/helpers';

type Tab = 'upcoming' | 'past' | 'analytics';

export default function CandidateInterviewsPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>('upcoming');
  const [candidate, setCandidate] = useState<any>(null);
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [notLinked, setNotLinked] = useState(false);

  const load = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setLoading(false);
      return;
    }
    const { data: cand } = await supabase.from('candidates').select('id').eq('user_id', session.user.id).single();
    if (!cand) {
      setNotLinked(true);
      setLoading(false);
      return;
    }
    setCandidate(cand);
    const { data: apps } = await supabase
      .from('applications')
      .select('*, job:jobs(title, company, location, url)')
      .eq('candidate_id', cand.id)
      .in('status', ['interview', 'offer', 'screening'])
      .order('updated_at', { ascending: false });
    setApplications(apps || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  const updateApplicationInterview = async (applicationId: string, interview_date: string | null, interview_notes: string) => {
    await supabase
      .from('applications')
      .update({
        interview_date: interview_date || null,
        interview_notes: interview_notes || null,
      })
      .eq('id', applicationId);
    setApplications((prev) =>
      prev.map((a) => (a.id === applicationId ? { ...a, interview_date: interview_date || null, interview_notes: interview_notes || null } : a))
    );
  };

  const now = new Date().toISOString().slice(0, 10);
  const upcoming = applications.filter((a: any) => a.status === 'interview' && (!a.interview_date || a.interview_date >= now));
  const past = applications.filter((a: any) => a.status === 'offer' || (a.status === 'interview' && a.interview_date && a.interview_date < now));
  const analyticsList = applications.filter((a: any) => ['interview', 'offer'].includes(a.status));

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'upcoming', label: 'Upcoming', icon: <Calendar size={16} /> },
    { id: 'past', label: 'Past', icon: <Briefcase size={16} /> },
    { id: 'analytics', label: 'Analytics', icon: <Briefcase size={16} /> },
  ];

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }
  if (notLinked) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-6 text-center px-4">
        <p className="text-sm text-surface-500 dark:text-surface-300">Your account isn&apos;t linked to a candidate profile yet. Contact your recruiter.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-surface-900 dark:text-surface-100 font-display">Interviews</h1>
      <p className="text-surface-500 dark:text-surface-400">Track upcoming interviews, past outcomes, and performance.</p>

      <div className="flex gap-1 p-1 rounded-xl bg-surface-100 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 w-fit">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              tab === t.id ? 'bg-white dark:bg-surface-700 text-surface-900 dark:text-white shadow-sm' : 'text-surface-600 dark:text-surface-400 hover:text-surface-900 dark:hover:text-white'
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'upcoming' && (
        <>
          {upcoming.length === 0 ? (
            <EmptyState
              icon={<Calendar size={24} />}
              title="No interviews scheduled"
              description="When an application moves to the interview stage, it will appear here so you can track dates and prep notes."
              action={
                <Link href="/dashboard/candidate/applications" className="btn-primary text-sm py-2 px-4">
                  View applications
                </Link>
              }
            />
          ) : (
            <>
              <p className="text-sm text-surface-500 dark:text-surface-400">
                {upcoming.length} interview{upcoming.length !== 1 ? 's' : ''} to prepare for
              </p>
              <div className="space-y-4">
                {upcoming.map((a: any) => (
                  <div key={a.id} className="rounded-2xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-5 space-y-4 shadow-sm">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div>
                        <p className="font-semibold text-surface-900 dark:text-surface-100 text-lg">{a.job?.title}</p>
                        <p className="text-sm text-surface-500 dark:text-surface-400">{a.job?.company}</p>
                        {a.job?.location && (
                          <p className="text-xs text-surface-400 dark:text-surface-500 flex items-center gap-1 mt-0.5">
                            <MapPin size={10} />
                            {a.job.location}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {a.job?.url && (
                          <a href={a.job.url} target="_blank" rel="noreferrer" className="btn-ghost p-2 rounded-xl" title="Job posting">
                            <ExternalLink size={14} />
                          </a>
                        )}
                        <Link href="/dashboard/candidate/applications" className="btn-secondary text-xs py-2 px-4">
                          View application
                        </Link>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-surface-100 dark:border-surface-700">
                      <div>
                        <label className="label text-xs dark:text-surface-200">Interview date</label>
                        <input
                          type="date"
                          value={a.interview_date ? String(a.interview_date).slice(0, 10) : ''}
                          onChange={(e) => updateApplicationInterview(a.id, e.target.value || null, a.interview_notes || '')}
                          className="input text-sm dark:bg-surface-700 dark:border-surface-600 dark:text-surface-100 w-full"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="label text-xs dark:text-surface-200">Prep notes</label>
                        <textarea
                          value={a.interview_notes || ''}
                          onChange={(e) => updateApplicationInterview(a.id, a.interview_date || null, e.target.value)}
                          className="input text-sm min-h-[80px] w-full dark:bg-surface-700 dark:border-surface-600 dark:text-surface-100"
                          placeholder="Questions to ask, talking points, follow-up..."
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {tab === 'past' && (
        <div className="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800 p-6">
          <h2 className="text-lg font-semibold text-surface-900 dark:text-white mb-4">Past interviews & outcomes</h2>
          {past.length === 0 ? (
            <p className="text-surface-500 dark:text-surface-400">No past interviews yet.</p>
          ) : (
            <ul className="space-y-4">
              {past.map((a: any) => (
                <li key={a.id} className="flex items-center gap-4 p-4 rounded-lg bg-surface-100 dark:bg-surface-900">
                  <Briefcase className="w-5 h-5 text-violet-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-surface-900 dark:text-white">{a.job?.title}</p>
                    <p className="text-sm text-surface-500 dark:text-surface-400">{a.job?.company}</p>
                    {a.interview_date && (
                      <p className="text-xs text-surface-500 flex items-center gap-1 mt-1">
                        <Calendar size={12} /> {new Date(a.interview_date).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <span className="text-xs font-medium px-2 py-1 rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-400 capitalize shrink-0">
                    {a.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'analytics' && (
        <div className="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800 p-6">
          <h2 className="text-lg font-semibold text-surface-900 dark:text-white mb-4">Recent interviews</h2>
          {analyticsList.length === 0 ? (
            <p className="text-surface-500 dark:text-surface-400">No interview-stage applications yet.</p>
          ) : (
            <ul className="space-y-4">
              {analyticsList.map((a: any) => (
                <li key={a.id} className="flex items-center gap-4 p-4 rounded-lg bg-surface-100 dark:bg-surface-900">
                  <Briefcase className="w-5 h-5 text-violet-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-surface-900 dark:text-white">{a.job?.title}</p>
                    <p className="text-sm text-surface-500 dark:text-surface-400">{a.job?.company}</p>
                    {a.interview_date && (
                      <p className="text-xs text-surface-500 flex items-center gap-1 mt-1">
                        <Calendar size={12} /> {new Date(a.interview_date).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <span className="text-xs font-medium px-2 py-1 rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-400 capitalize shrink-0">
                    {a.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
