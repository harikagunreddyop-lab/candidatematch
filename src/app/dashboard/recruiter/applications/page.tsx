'use client';
// src/app/dashboard/recruiter/applications/page.tsx
import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { SearchInput, EmptyState, Spinner, StatusBadge } from '@/components/ui';
import { ClipboardList, Calendar } from 'lucide-react';
import { formatDate, cn } from '@/utils/helpers';

const STATUS_OPTIONS = ['ready', 'applied', 'screening', 'interview', 'offer', 'rejected', 'withdrawn'];

const STATUS_PILL: Record<string, string> = {
  ready:      'bg-surface-100 dark:bg-surface-600 text-surface-600 dark:text-surface-300',
  applied:    'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-200',
  screening:  'bg-yellow-100 dark:bg-yellow-500/20 text-yellow-700 dark:text-yellow-200',
  interview:  'bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-200',
  offer:      'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-200',
  rejected:   'bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-300',
  withdrawn:  'bg-surface-100 dark:bg-surface-600 text-surface-500 dark:text-surface-400',
};

export default function RecruiterApplicationsPage() {
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [schedulingAppId, setSchedulingAppId] = useState<string | null>(null);
  const [interviewDate, setInterviewDate] = useState('');
  const [interviewNotes, setInterviewNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setLoading(false); return; }

    // Step 1: get assigned candidate IDs
    const { data: assignments } = await supabase
      .from('recruiter_candidate_assignments')
      .select('candidate_id')
      .eq('recruiter_id', session.user.id);

    const ids = (assignments || []).map((a: any) => a.candidate_id as string);

    if (ids.length === 0) { setApplications([]); setLoading(false); return; }

    // Step 2: get all applications for those candidates (include interview_notes for schedule modal)
    const { data } = await supabase
      .from('applications')
      .select('*, job:jobs(title, company, location, url), candidate:candidates(full_name, primary_title)')
      .in('candidate_id', ids)
      .order('updated_at', { ascending: false });

    setApplications(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const channel = supabase.channel('recruiter-applications')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'applications' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recruiter_candidate_assignments' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load, supabase]);

  const updateStatus = async (appId: string, status: string) => {
    await supabase.from('applications').update({
      status,
      ...(status === 'applied' ? { applied_at: new Date().toISOString() } : {}),
    }).eq('id', appId);
    await load();
  };

  const openScheduler = (app: any) => {
    setSchedulingAppId(app.id);
    setInterviewDate(app.interview_date ? app.interview_date.slice(0, 16) : '');
    setInterviewNotes(app.interview_notes || app.notes || '');
  };

  const saveInterview = async (appId: string) => {
    setSaving(true);
    await supabase.from('applications').update({
      status: 'interview',
      interview_date: interviewDate || null,
      interview_notes: interviewNotes || null,
    }).eq('id', appId);
    setSchedulingAppId(null);
    setSaving(false);
    await load();
  };

  // Status pill counts
  const counts = STATUS_OPTIONS.reduce((acc, s) => {
    acc[s] = applications.filter(a => a.status === s).length;
    return acc;
  }, {} as Record<string, number>);

  const filtered = applications.filter(a => {
    const s = search.toLowerCase();
    const matchSearch = !s
      || a.candidate?.full_name?.toLowerCase().includes(s)
      || a.job?.title?.toLowerCase().includes(s)
      || a.job?.company?.toLowerCase().includes(s);
    const matchStatus = statusFilter === 'all' || a.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-100 font-display">Applications</h1>
        <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">
          Track and update status for all your candidates&apos; applications
        </p>
      </div>

      {/* Status filter pills — only show statuses that have entries */}
      {!loading && applications.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setStatusFilter('all')}
            className={cn(
              'px-3 py-1 rounded-full text-xs font-medium transition-colors',
              statusFilter === 'all'
                ? 'bg-surface-900 dark:bg-surface-600 text-white'
                : 'bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-300 hover:bg-surface-200 dark:hover:bg-surface-600'
            )}
          >
            All ({applications.length})
          </button>
          {STATUS_OPTIONS.filter(s => counts[s] > 0).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                'px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors',
                statusFilter === s
                  ? 'bg-surface-900 dark:bg-surface-600 text-white'
                  : cn(STATUS_PILL[s], 'hover:opacity-80')
              )}
            >
              {s} ({counts[s]})
            </button>
          ))}
        </div>
      )}

      <SearchInput value={search} onChange={setSearch} placeholder="Search candidate, job, or company…" />

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={28} /></div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<ClipboardList size={24} />}
          title={applications.length === 0 ? 'No applications yet' : 'No results'}
          description={
            applications.length === 0
              ? 'Mark candidates as applied from their profile or pipeline board'
              : 'Try adjusting your search or status filter'
          }
        />
      ) : (
        <div className="space-y-2">
          {filtered.map(a => (
            <div key={a.id} className="card p-4">
              <div className="flex items-start gap-4 flex-wrap">
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-surface-900">{a.candidate?.full_name}</p>
                    <span className="text-surface-300">·</span>
                    <p className="text-sm text-surface-600">{a.job?.title}</p>
                    <span className="text-surface-300">·</span>
                    <p className="text-sm text-surface-500">{a.job?.company}</p>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    <p className="text-xs text-surface-400">{a.candidate?.primary_title}</p>
                    {a.applied_at && (
                      <p className="text-xs text-surface-400">Applied {formatDate(a.applied_at)}</p>
                    )}
                    {a.interview_date && (
                      <p className="text-xs text-purple-600 flex items-center gap-1">
                        <Calendar size={10} /> Interview {formatDate(a.interview_date)}
                      </p>
                    )}
                  </div>
                </div>

                {/* Status + update */}
                <div className="flex items-center gap-2 shrink-0">
                  <StatusBadge status={a.status} />
                  <select
                    value={a.status}
                    onChange={e => updateStatus(a.id, e.target.value)}
                    className="input text-xs py-1 px-2 w-32"
                    aria-label="Update status"
                  >
                    {STATUS_OPTIONS.map(s => (
                      <option key={s} value={s} className="capitalize">{s}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Interview scheduler — inline, appears when status = interview */}
              {a.status === 'interview' && (
                <div className="mt-3 pt-3 border-t border-surface-100">
                  {schedulingAppId === a.id ? (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <input
                          type="datetime-local"
                          value={interviewDate}
                          onChange={e => setInterviewDate(e.target.value)}
                          className="input text-xs py-1 flex-1"
                        />
                        <button
                          onClick={() => saveInterview(a.id)}
                          disabled={saving}
                          className="btn-primary text-xs px-3 py-1 flex items-center gap-1"
                        >
                          {saving ? <Spinner size={12} /> : 'Save'}
                        </button>
                        <button onClick={() => setSchedulingAppId(null)} className="btn-ghost text-xs px-2">
                          ✕
                        </button>
                      </div>
                      <textarea
                        value={interviewNotes}
                        onChange={e => setInterviewNotes(e.target.value)}
                        placeholder="Notes (interviewer name, format, topics to prep…)"
                        className="input text-xs h-16 resize-none w-full"
                      />
                    </div>
                  ) : (
                    <button
                      onClick={() => openScheduler(a)}
                      className="text-xs text-purple-600 hover:text-purple-700 flex items-center gap-1.5"
                    >
                      <Calendar size={12} />
                      {a.interview_date
                        ? `Interview on ${formatDate(a.interview_date)} — Edit`
                        : '+ Schedule interview date & notes'}
                    </button>
                  )}
                  {(a.interview_notes || a.notes) && schedulingAppId !== a.id && (
                    <p className="text-xs text-surface-500 mt-1 italic">&quot;{a.interview_notes || a.notes}&quot;</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}