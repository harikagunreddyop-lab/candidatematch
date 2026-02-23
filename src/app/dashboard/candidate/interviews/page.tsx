'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-browser';
import { EmptyState } from '@/components/ui';
import { Calendar, MapPin, ExternalLink } from 'lucide-react';

export default function CandidateInterviewsPage() {
  const supabase = createClient();
  const [candidate, setCandidate] = useState<any>(null);
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [notLinked, setNotLinked] = useState(false);

  const load = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setLoading(false); return; }
    const { data: cand } = await supabase.from('candidates').select('id').eq('user_id', session.user.id).single();
    if (!cand) { setNotLinked(true); setLoading(false); return; }
    setCandidate(cand);
    const { data: apps } = await supabase
      .from('applications')
      .select('*, job:jobs(title, company, location, url)')
      .eq('candidate_id', cand.id)
      .eq('status', 'interview')
      .order('updated_at', { ascending: false });
    setApplications(apps || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const updateApplicationInterview = async (applicationId: string, interview_date: string | null, interview_notes: string) => {
    await supabase.from('applications').update({
      interview_date: interview_date || null,
      interview_notes: interview_notes || null,
    }).eq('id', applicationId);
    setApplications(prev => prev.map(a => a.id === applicationId ? { ...a, interview_date: interview_date || null, interview_notes: interview_notes || null } : a));
  };

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-500 border-t-transparent" /></div>;
  if (notLinked) return (
    <div className="flex flex-col items-center justify-center py-24 gap-6 text-center px-4">
      <p className="text-sm text-surface-500 dark:text-surface-300">Your account isn&apos;t linked to a candidate profile yet. Contact your recruiter.</p>
    </div>
  );

  const interviewApps = applications;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-surface-900 dark:text-surface-100 font-display">Interviews</h1>
      {interviewApps.length === 0 ? (
        <EmptyState
          icon={<Calendar size={24} />}
          title="No interviews scheduled"
          description="When an application moves to the interview stage, it will appear here so you can track dates and prep notes."
          action={<Link href="/dashboard/candidate" className="btn-primary text-sm py-2 px-4">View applications</Link>}
        />
      ) : (
        <>
          <p className="text-sm text-surface-500 dark:text-surface-400">{interviewApps.length} interview{interviewApps.length !== 1 ? 's' : ''} to prepare for</p>
          <div className="space-y-4">
            {interviewApps.map((a: any) => (
              <div key={a.id} className="rounded-2xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-5 space-y-4 shadow-sm">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <p className="font-semibold text-surface-900 dark:text-surface-100 text-lg">{a.job?.title}</p>
                    <p className="text-sm text-surface-500 dark:text-surface-400">{a.job?.company}</p>
                    {a.job?.location && <p className="text-xs text-surface-400 dark:text-surface-500 flex items-center gap-1 mt-0.5"><MapPin size={10} />{a.job.location}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    {a.job?.url && <a href={a.job.url} target="_blank" rel="noreferrer" className="btn-ghost p-2 rounded-xl" title="Job posting"><ExternalLink size={14} /></a>}
                    <Link href="/dashboard/candidate" className="btn-secondary text-xs py-2 px-4">View application</Link>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-surface-100 dark:border-surface-700">
                  <div>
                    <label className="label text-xs dark:text-surface-200">Interview date</label>
                    <input
                      type="date"
                      value={a.interview_date ? String(a.interview_date).slice(0, 10) : ''}
                      onChange={e => updateApplicationInterview(a.id, e.target.value || null, a.interview_notes || '')}
                      className="input text-sm dark:bg-surface-700 dark:border-surface-600 dark:text-surface-100 w-full"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="label text-xs dark:text-surface-200">Prep notes</label>
                    <textarea
                      value={a.interview_notes || ''}
                      onChange={e => updateApplicationInterview(a.id, a.interview_date || null, e.target.value)}
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
    </div>
  );
}
