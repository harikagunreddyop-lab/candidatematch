'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-browser';
import { Spinner, StatusBadge } from '@/components/ui';
import { Calendar, User, ChevronRight } from 'lucide-react';
import { formatDate, cn } from '@/utils/helpers';

export default function AdminInterviewsPage() {
  const supabase = createClient();
  const [applications, setApplications] = useState<any[]>([]);
  const [recruiters, setRecruiters] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState<'upcoming' | 'past' | 'all'>('upcoming');

  const load = useCallback(async () => {
    setLoading(true);
    const [appsRes, recsRes, asgRes] = await Promise.all([
      supabase.from('applications')
        .select('*, candidate:candidates(id, full_name, primary_title, assigned_recruiter_id), job:jobs(title, company, location, url)')
        .eq('status', 'interview')
        .not('interview_date', 'is', null)
        .order('interview_date', { ascending: true }),
      supabase.from('profiles').select('id, name, email').eq('role', 'recruiter').order('name'),
      supabase.from('recruiter_candidate_assignments').select('candidate_id, recruiter_id'),
    ]);
    setApplications(appsRes.data || []);
    setRecruiters(recsRes.data || []);
    const map: Record<string, string> = {};
    for (const a of asgRes.data || []) map[a.candidate_id] = a.recruiter_id;
    setAssignments(map);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const getRecruiterName = (candidateId: string) => {
    const rid = assignments[candidateId] || (applications.find(a => a.candidate_id === candidateId)?.candidate as any)?.assigned_recruiter_id;
    const r = recruiters.find(x => x.id === rid);
    return r?.name || r?.email || null;
  };

  const now = new Date().toISOString();
  let filtered = applications;
  if (dateFilter === 'upcoming') filtered = applications.filter(a => a.interview_date >= now);
  else if (dateFilter === 'past') filtered = applications.filter(a => a.interview_date < now);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 font-display">Interviews</h1>
          <p className="text-sm text-surface-500 mt-1">All scheduled interviews across candidates</p>
        </div>
        <div className="flex gap-2">
          {(['upcoming', 'past', 'all'] as const).map(f => (
            <button key={f} onClick={() => setDateFilter(f)} className={cn('px-3 py-1.5 rounded-lg text-sm font-medium', dateFilter === f ? 'bg-surface-900 text-white' : 'bg-surface-100 text-surface-600 hover:bg-surface-200')}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={28} /></div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center text-surface-500">
          <Calendar size={40} className="mx-auto mb-3 opacity-50" />
          <p>No interviews {dateFilter === 'upcoming' ? 'upcoming' : dateFilter === 'past' ? 'in the past' : 'scheduled'}.</p>
          <Link href="/dashboard/admin/applications" className="text-brand-600 hover:underline text-sm mt-2 inline-block">Go to Applications</Link>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(a => (
            <div key={a.id} className="card p-4 flex items-center gap-4 flex-wrap">
              <div className="w-12 h-12 rounded-xl bg-purple-100 dark:bg-purple-500/20 flex items-center justify-center shrink-0">
                <Calendar size={20} className="text-purple-600 dark:text-purple-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-surface-900">{formatDate(a.interview_date)}</p>
                <Link href={`/dashboard/admin/candidates/${a.candidate_id}`} className="text-sm text-surface-600 hover:text-brand-600 flex items-center gap-1 mt-0.5">
                  {(a.candidate as any)?.full_name} <ChevronRight size={12} />
                </Link>
                <p className="text-sm text-surface-500">{a.job?.title} at {a.job?.company}</p>
                {getRecruiterName(a.candidate_id) && (
                  <p className="text-xs text-surface-400 flex items-center gap-1 mt-0.5"><User size={10} /> {getRecruiterName(a.candidate_id)}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {a.job?.url && (
                  <a href={a.job.url} target="_blank" rel="noreferrer" className="btn-ghost text-xs py-2 px-3">Job link</a>
                )}
                <Link href="/dashboard/admin/applications" className="btn-secondary text-xs py-2 px-3">Applications</Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
