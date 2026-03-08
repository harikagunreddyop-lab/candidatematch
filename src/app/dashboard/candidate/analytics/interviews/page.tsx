'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { Calendar, Briefcase } from 'lucide-react';

export default function InterviewAnalyticsPage() {
  const supabase = createClient();
  const [interviews, setInterviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }
      const { data: c } = await supabase.from('candidates').select('id').eq('user_id', session.user.id).single();
      if (!c) { setLoading(false); return; }
      const { data } = await supabase
        .from('applications')
        .select('id, status, interview_date, interview_notes, job:jobs(title, company)')
        .eq('candidate_id', c.id)
        .in('status', ['interview', 'offer'])
        .order('updated_at', { ascending: false });
      setInterviews(data || []);
      setLoading(false);
    })();
  }, [supabase]);

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-2 border-violet-500 border-t-transparent" /></div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold text-surface-900 dark:text-white">Interview analytics</h1>
      <p className="text-surface-500 dark:text-surface-400">Track interviews and outcomes.</p>
      <div className="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800 p-6">
        <h2 className="text-lg font-semibold text-surface-900 dark:text-white mb-4">Recent interviews</h2>
        {interviews.length === 0 ? (
          <p className="text-surface-500 dark:text-surface-400">No interview-stage applications yet.</p>
        ) : (
          <ul className="space-y-4">
            {interviews.map((a: any) => (
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
                <span className="text-xs font-medium px-2 py-1 rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-400 capitalize">{a.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
