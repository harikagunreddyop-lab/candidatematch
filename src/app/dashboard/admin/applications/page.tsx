'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-browser';
import { SearchInput, EmptyState, Spinner, StatusBadge } from '@/components/ui';
import { ClipboardList, Calendar, User, ChevronRight } from 'lucide-react';
import { formatDate, cn } from '@/utils/helpers';

const STATUS_OPTIONS = ['ready', 'applied', 'screening', 'interview', 'offer', 'rejected', 'withdrawn'];
const STATUS_PILL: Record<string, string> = {
  ready: 'bg-surface-100 text-surface-600',
  applied: 'bg-blue-100 text-blue-700',
  screening: 'bg-yellow-100 text-yellow-700',
  interview: 'bg-purple-100 text-purple-700',
  offer: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-600',
  withdrawn: 'bg-surface-100 text-surface-500',
};

export default function AdminApplicationsPage() {
  const supabase = createClient();
  const [applications, setApplications] = useState<any[]>([]);
  const [recruiters, setRecruiters] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [recruiterFilter, setRecruiterFilter] = useState<string>('all');
  const [schedulingAppId, setSchedulingAppId] = useState<string | null>(null);
  const [interviewDate, setInterviewDate] = useState('');
  const [interviewNotes, setInterviewNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [appsRes, recsRes, asgRes] = await Promise.all([
      supabase.from('applications')
        .select('*, job:jobs(title, company, location, url), candidate:candidates(id, full_name, primary_title, assigned_recruiter_id)')
        .order('updated_at', { ascending: false }),
      supabase.from('profiles').select('id, name, email').eq('role', 'recruiter').order('name'),
      supabase.from('recruiter_candidate_assignments').select('candidate_id, recruiter_id'),
    ]);
    setApplications(appsRes.data || []);
    setRecruiters(recsRes.data || []);
    const map: Record<string, string> = {};
    for (const a of asgRes.data || []) {
      map[a.candidate_id] = a.recruiter_id;
    }
    setAssignments(map);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async (appId: string, status: string) => {
    await supabase.from('applications').update({ status }).eq('id', appId);
    await load();
  };

  const openScheduler = (app: any) => {
    setSchedulingAppId(app.id);
    setInterviewDate(app.interview_date ? String(app.interview_date).slice(0, 16) : '');
    setInterviewNotes(app.interview_notes || app.notes || '');
  };

  const saveInterview = async (appId: string) => {
    setSaving(true);
    await supabase.from('applications').update({
      status: 'interview',
      interview_date: interviewDate || null,
      interview_notes: interviewNotes || null,
      notes: interviewNotes || null,
    }).eq('id', appId);
    setSchedulingAppId(null);
    setSaving(false);
    await load();
  };

  const getRecruiterName = (candidateId: string) => {
    const rid = assignments[candidateId] || (applications.find(a => a.candidate_id === candidateId)?.candidate as any)?.assigned_recruiter_id;
    if (!rid) return null;
    const r = recruiters.find(x => x.id === rid);
    return r?.name || r?.email || null;
  };

  const counts = STATUS_OPTIONS.reduce((acc, s) => {
    acc[s] = applications.filter(a => a.status === s).length;
    return acc;
  }, {} as Record<string, number>);

  let filtered = applications.filter(a => {
    const s = search.toLowerCase();
    const matchSearch = !s
      || (a.candidate as any)?.full_name?.toLowerCase().includes(s)
      || a.job?.title?.toLowerCase().includes(s)
      || a.job?.company?.toLowerCase().includes(s);
    const matchStatus = statusFilter === 'all' || a.status === statusFilter;
    const recId = assignments[a.candidate_id] || (a.candidate as any)?.assigned_recruiter_id;
    const matchRecruiter = recruiterFilter === 'all' || recId === recruiterFilter;
    return matchSearch && matchStatus && matchRecruiter;
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-surface-900 font-display">Applications</h1>
        <p className="text-sm text-surface-500 mt-1">All applications across candidates · filter by recruiter or status</p>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <SearchInput value={search} onChange={setSearch} placeholder="Search candidate, job, or company…" className="min-w-[200px]" />
        <select value={recruiterFilter} onChange={e => setRecruiterFilter(e.target.value)} className="input text-sm py-2 px-3 w-48">
          <option value="all">All recruiters</option>
          {recruiters.map(r => (
            <option key={r.id} value={r.id}>{r.name || r.email}</option>
          ))}
        </select>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setStatusFilter('all')} className={cn('px-3 py-1.5 rounded-full text-xs font-medium', statusFilter === 'all' ? 'bg-surface-900 text-white' : 'bg-surface-100 text-surface-600 hover:bg-surface-200')}>
            All ({applications.length})
          </button>
          {STATUS_OPTIONS.filter(s => counts[s] > 0).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)} className={cn('px-3 py-1.5 rounded-full text-xs font-medium capitalize', statusFilter === s ? 'bg-surface-900 text-white' : STATUS_PILL[s], 'hover:opacity-80')}>
              {s} ({counts[s]})
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={28} /></div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={<ClipboardList size={24} />} title={applications.length === 0 ? 'No applications yet' : 'No results'} description={applications.length === 0 ? 'Applications appear when candidates apply or recruiters mark applied' : 'Try adjusting filters'} />
      ) : (
        <div className="space-y-2">
          {filtered.map(a => (
            <div key={a.id} className="card p-4">
              <div className="flex items-start gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link href={`/dashboard/admin/candidates/${a.candidate_id}`} className="text-sm font-semibold text-surface-900 hover:text-brand-600 flex items-center gap-1">
                      {(a.candidate as any)?.full_name}
                      <ChevronRight size={12} />
                    </Link>
                    <span className="text-surface-300">·</span>
                    <span className="text-sm text-surface-600">{a.job?.title}</span>
                    <span className="text-surface-300">·</span>
                    <span className="text-sm text-surface-500">{a.job?.company}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    <p className="text-xs text-surface-400">{(a.candidate as any)?.primary_title}</p>
                    {getRecruiterName(a.candidate_id) && (
                      <span className="text-xs text-surface-500 flex items-center gap-1">
                        <User size={10} /> {getRecruiterName(a.candidate_id)}
                      </span>
                    )}
                    {a.applied_at && <p className="text-xs text-surface-400">Applied {formatDate(a.applied_at)}</p>}
                    {a.interview_date && (
                      <p className="text-xs text-purple-600 flex items-center gap-1">
                        <Calendar size={10} /> Interview {formatDate(a.interview_date)}
                      </p>
                    )}
                  </div>
                  {(a.candidate_notes || a.interview_notes) && (
                    <div className="mt-2 text-xs text-surface-500 space-y-0.5">
                      {a.candidate_notes && <p>Candidate note: &quot;{a.candidate_notes}&quot;</p>}
                      {a.interview_notes && <p>Interview notes: &quot;{a.interview_notes}&quot;</p>}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusBadge status={a.status} />
                  <select value={a.status} onChange={e => updateStatus(a.id, e.target.value)} className="input text-xs py-1 px-2 w-32" aria-label="Update status">
                    {STATUS_OPTIONS.map(s => (
                      <option key={s} value={s} className="capitalize">{s}</option>
                    ))}
                  </select>
                </div>
              </div>
              {a.status === 'interview' && (
                <div className="mt-3 pt-3 border-t border-surface-100">
                  {schedulingAppId === a.id ? (
                    <div className="space-y-2">
                      <div className="flex gap-2 flex-wrap">
                        <input type="datetime-local" value={interviewDate} onChange={e => setInterviewDate(e.target.value)} className="input text-xs py-1.5 flex-1 min-w-[180px]" />
                        <button onClick={() => saveInterview(a.id)} disabled={saving} className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1">{saving ? <Spinner size={12} /> : 'Save'}</button>
                        <button onClick={() => setSchedulingAppId(null)} className="btn-ghost text-xs px-2">✕</button>
                      </div>
                      <textarea value={interviewNotes} onChange={e => setInterviewNotes(e.target.value)} placeholder="Interview notes…" className="input text-xs h-16 resize-none w-full" />
                    </div>
                  ) : (
                    <button onClick={() => openScheduler(a)} className="text-xs text-purple-600 hover:text-purple-700 flex items-center gap-1.5">
                      <Calendar size={12} />
                      {a.interview_date ? `Interview ${formatDate(a.interview_date)} — Edit` : '+ Schedule interview date & notes'}
                    </button>
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
