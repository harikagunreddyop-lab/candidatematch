'use client';
// src/app/dashboard/recruiter/applications/page.tsx
import { useState, useEffect, useCallback } from 'react';
import { createClient, subscribeWithLog } from '@/lib/supabase-browser';
import { SearchInput, EmptyState, Spinner, StatusBadge, ToastContainer } from '@/components/ui';
import { DashboardErrorBoundary } from '@/components/layout/DashboardErrorBoundary';
import { useToast } from '@/hooks';
import { ClipboardList, Calendar, Brain } from 'lucide-react';
import { formatDate, cn } from '@/utils/helpers';

const STATUS_OPTIONS = ['ready', 'applied', 'screening', 'interview', 'offer', 'rejected', 'withdrawn'];

const STATUS_PILL: Record<string, string> = {
  ready: 'bg-surface-100 dark:bg-surface-600 text-surface-600 dark:text-surface-300',
  applied: 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-200',
  screening: 'bg-yellow-100 dark:bg-yellow-500/20 text-yellow-700 dark:text-yellow-200',
  interview: 'bg-brand-400/10 text-brand-400',
  offer: 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-200',
  rejected: 'bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-300',
  withdrawn: 'bg-surface-100 dark:bg-surface-600 text-surface-500 dark:text-surface-400',
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
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);
  const [interviewKitAppId, setInterviewKitAppId] = useState<string | null>(null);
  const [interviewKitLoading, setInterviewKitLoading] = useState(false);
  const [interviewKit, setInterviewKit] = useState<{ questions: string[] } | null>(null);
  const { toasts, toast, dismiss } = useToast();
  const supabase = createClient();

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setLoading(false); return; }

    const { data: profile } = await supabase
      .from('profile_roles')
      .select('company_id')
      .eq('id', session.user.id)
      .single();

    if (!profile?.company_id) {
      setApplications([]);
      setLoading(false);
      return;
    }

    const { data: companyJobs } = await supabase
      .from('jobs')
      .select('id')
      .eq('company_id', profile.company_id);

    const jobIds = (companyJobs || []).map((j: any) => j.id);
    if (jobIds.length === 0) {
      setApplications([]);
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from('applications')
      .select('*, job:jobs(title, company, location, url), candidate:candidates(full_name, primary_title)')
      .in('job_id', jobIds)
      .order('updated_at', { ascending: false });

    setApplications(data || []);
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- supabase unstable; load runs once and on realtime
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const channel = supabase.channel('recruiter-applications')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'applications' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs' }, () => load());
    subscribeWithLog(channel, 'recruiter-applications');
    return () => { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- supabase unstable; channel with load
  }, [load, supabase]);

  const updateStatus = async (appId: string, status: string) => {
    const app = applications.find((a: any) => a.id === appId);
    const prevStatus = app?.status;
    setStatusUpdatingId(appId);
    try {
      const res = await fetch('/api/applications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: appId, status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(data.error || 'Failed to update status', 'error');
        return;
      }
      await load();
      if (prevStatus) {
        toast('Status updated', 'success', {
          undo: async () => {
            await fetch('/api/applications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: appId, status: prevStatus }) });
            await load();
          }
        });
      }
    } catch (e: any) {
      toast(e.message || 'Failed to update status', 'error');
    } finally {
      setStatusUpdatingId(null);
    }
  };

  const openScheduler = (app: any) => {
    setSchedulingAppId(app.id);
    setInterviewDate(app.interview_date ? app.interview_date.slice(0, 16) : '');
    setInterviewNotes(app.interview_notes || app.notes || '');
  };

  const fetchInterviewKit = async (app: any) => {
    setInterviewKitAppId(app.id);
    setInterviewKitLoading(true);
    setInterviewKit(null);
    try {
      const res = await fetch('/api/ats/interview-kit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidate_id: app.candidate_id, job_id: app.job_id }),
      });
      const data = await res.json();
      if (res.ok) {
        setInterviewKit({ questions: data.questions || [] });
      } else {
        toast(data.error || 'Failed to generate interview questions', 'error');
      }
    } catch (e: any) {
      toast(e.message || 'Failed to generate interview questions', 'error');
    } finally {
      setInterviewKitLoading(false);
    }
  };

  const saveInterview = async (appId: string) => {
    setSaving(true);
    try {
      const res = await fetch('/api/applications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: appId,
          status: 'interview',
          interview_date: interviewDate || null,
          interview_notes: interviewNotes || null,
          notes: interviewNotes || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(data.error || 'Failed to save interview details', 'error');
        return;
      }
      setSchedulingAppId(null);
      await load();
    } catch (e: any) {
      toast(e.message || 'Failed to save interview details', 'error');
    } finally {
      setSaving(false);
    }
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
    <DashboardErrorBoundary sectionName="Applications">
      <div className="space-y-5">
      <ToastContainer toasts={toasts} dismiss={dismiss} />
      <div>
        <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-100 font-display">Applications</h1>
        <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">
          Applications to your company&apos;s jobs
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
                ? 'bg-surface-900 text-[#0a0a0a] font-bold dark:bg-surface-600 dark:text-white dark:font-semibold'
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
                  ? 'bg-surface-900 text-[#0a0a0a] font-bold dark:bg-surface-600 dark:text-white dark:font-semibold'
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
              ? 'Applications to your company\'s jobs will appear here when candidates apply.'
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
                      <p className="text-xs text-brand-400 flex items-center gap-1">
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
                    disabled={statusUpdatingId === a.id}
                    className="input text-xs py-1 px-2 w-32"
                    aria-label="Update status"
                  >
                    {STATUS_OPTIONS.map(s => (
                      <option key={s} value={s} className="capitalize">{s}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Interview scheduler + interview kit — when status = interview */}
              {a.status === 'interview' && (
                <div className="mt-3 pt-3 border-t border-surface-100 space-y-3">
                  {/* Interview kit */}
                  <div>
                    {interviewKitAppId === a.id && interviewKit ? (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-brand-400">Interview questions</p>
                        <ol className="list-decimal list-inside text-xs text-surface-600 space-y-1">
                          {interviewKit.questions.map((q, i) => (
                            <li key={i}>{q}</li>
                          ))}
                        </ol>
                        <button onClick={() => setInterviewKitAppId(null)} className="text-xs text-surface-500 hover:underline">Close</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => fetchInterviewKit(a)}
                        disabled={interviewKitLoading}
                        className="text-xs text-brand-400 hover:text-brand-400 flex items-center gap-1.5"
                      >
                        <Brain size={12} />
                        {interviewKitLoading && interviewKitAppId === a.id ? 'Generating…' : 'Generate interview questions'}
                      </button>
                    )}
                  </div>
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
                      className="text-xs text-brand-400 hover:text-brand-400 flex items-center gap-1.5"
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
    </DashboardErrorBoundary>
  );
}