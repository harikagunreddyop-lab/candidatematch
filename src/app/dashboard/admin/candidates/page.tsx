'use client';
// src/app/dashboard/admin/candidates/page.tsx
import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import { SearchInput, EmptyState, Spinner, Modal } from '@/components/ui';
import {
  Users,
  RefreshCw,
  AlertCircle,
  Star,
  ChevronRight,
  MapPin,
  Send,
  UserPlus,
  Trash2,
  Plus,
} from 'lucide-react';
import { cn } from '@/utils/helpers';
import Link from 'next/link';

const STATUS_COLORS: Record<string, string> = {
  ready: 'bg-surface-100 dark:bg-surface-600 text-surface-600 dark:text-surface-300',
  applied: 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-200',
  screening: 'bg-yellow-100 dark:bg-yellow-500/20 text-yellow-700 dark:text-yellow-200',
  interview: 'bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-200',
  offer: 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-200',
  rejected: 'bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-300',
};

function CandidatesPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const highlightId = searchParams.get('highlight');
  const highlightRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  const [candidates, setCandidates] = useState<any[]>([]);
  const [recruiters, setRecruiters] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterAssignment, setFilterAssignment] = useState<'all' | 'unassigned' | 'assigned'>('all');
  const [filterActive, setFilterActive] = useState('all');
  const [filterRecruiter, setFilterRecruiter] = useState<string>('all');
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  // Assign recruiter modal
  const [assignTarget, setAssignTarget] = useState<any | null>(null);
  const [assigningId, setAssigningId] = useState('');
  const [savingAssign, setSavingAssign] = useState(false);
  const [removingAssign, setRemovingAssign] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [candRes, recRes, asgRes] = await Promise.all([
      supabase.from('candidates').select('*, applications(status)').not('invite_accepted_at', 'is', null).order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, name, email').eq('role', 'recruiter').order('name'),
      supabase.from('recruiter_candidate_assignments').select('candidate_id, recruiter_id'),
    ]);

    if (candRes.error) setError(candRes.error.message);
    else setCandidates(candRes.data || []);

    setRecruiters(recRes.data || []);

    const map: Record<string, string[]> = {};
    for (const a of asgRes.data || []) {
      if (!map[a.candidate_id]) map[a.candidate_id] = [];
      map[a.candidate_id].push(a.recruiter_id);
    }
    setAssignments(map);

    setLastRefreshed(new Date());
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  // Scroll to highlighted candidate
  useEffect(() => {
    if (!highlightId || !candidates.length) return;
    setTimeout(() => {
      const el = document.getElementById(`candidate-row-${highlightId}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el?.classList.add('ring-2', 'ring-brand-400', 'ring-offset-2');
    }, 300);
  }, [highlightId, candidates]);

  useEffect(() => {
    const channel = supabase
      .channel('admin-candidates-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'candidates' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recruiter_candidate_assignments' }, () => load())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [load, supabase]);

  const assignRecruiter = async () => {
    if (!assignTarget || !assigningId) return;
    setSavingAssign(true);

    await supabase.from('recruiter_candidate_assignments').upsert({
      recruiter_id: assigningId,
      candidate_id: assignTarget.id,
    });
    // Sync assigned_recruiter_id so candidate messages see this recruiter
    await supabase.from('candidates').update({ assigned_recruiter_id: assigningId, updated_at: new Date().toISOString() }).eq('id', assignTarget.id);

    setAssigningId('');
    setSavingAssign(false);
    await load();
  };

  const removeRecruiter = async (candidateId: string, recruiterId: string) => {
    setRemovingAssign(recruiterId);
    await supabase.from('recruiter_candidate_assignments').delete().eq('recruiter_id', recruiterId).eq('candidate_id', candidateId);
    // Sync assigned_recruiter_id: set to another assigned recruiter or null
    const { data: remaining } = await supabase.from('recruiter_candidate_assignments').select('recruiter_id').eq('candidate_id', candidateId).order('assigned_at', { ascending: true }).limit(1);
    const nextRecruiterId = remaining?.[0]?.recruiter_id ?? null;
    await supabase.from('candidates').update({ assigned_recruiter_id: nextRecruiterId, updated_at: new Date().toISOString() }).eq('id', candidateId);
    setRemovingAssign(null);
    await load();
  };

  const filtered = candidates.filter((c) => {
    const matchSearch =
      c.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      c.primary_title?.toLowerCase().includes(search.toLowerCase()) ||
      c.location?.toLowerCase().includes(search.toLowerCase());

    const assignedIds = assignments[c.id] || [];
    const isAssigned = assignedIds.length > 0;
    const matchAssignment =
      filterAssignment === 'all' ||
      (filterAssignment === 'unassigned' && !isAssigned) ||
      (filterAssignment === 'assigned' && isAssigned);
    const matchActive = filterActive === 'all' || (filterActive === 'active' ? c.active : !c.active);
    const matchRecruiter = filterRecruiter === 'all' || assignedIds.includes(filterRecruiter);

    return matchSearch && matchAssignment && matchActive && matchRecruiter;
  });

  const unassignedCount = candidates.filter((c) => !(assignments[c.id] || []).length).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 font-display">Candidates</h1>
          <p className="text-sm text-surface-500 mt-1">
            {candidates.length} total
            {lastRefreshed && (
              <span className="text-surface-400">
                {' '}
                · {lastRefreshed.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={load} className="btn-ghost text-sm flex items-center gap-1.5">
            <RefreshCw size={14} />
          </button>
          <Link href="/dashboard/admin/users" className="btn-secondary text-sm flex items-center gap-1.5">
            <Send size={14} /> Invite Candidate
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 dark:border-red-500/40 bg-red-50 dark:bg-red-900/30 px-4 py-3 text-sm text-red-700 dark:text-red-200 flex items-center gap-2">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {unassignedCount > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30">
          <UserPlus size={15} className="text-amber-600 dark:text-amber-400 shrink-0" />
          <p className="text-sm text-amber-800 dark:text-amber-200">
            <span className="font-semibold">{unassignedCount} candidate{unassignedCount !== 1 ? 's' : ''}</span> waiting for recruiter assignment.
          </p>
          <button
            onClick={() => setFilterAssignment('unassigned')}
            className="ml-auto text-xs text-amber-700 dark:text-amber-300 underline"
          >
            Show them
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <SearchInput value={search} onChange={setSearch} placeholder="Search name, title, location..." />
        <select value={filterAssignment} onChange={(e) => setFilterAssignment(e.target.value as 'all' | 'unassigned' | 'assigned')} className="input text-sm w-full sm:w-44" aria-label="Assignment filter">
          <option value="all">All</option>
          <option value="unassigned">Waiting for recruiter</option>
          <option value="assigned">Assigned</option>
        </select>
        <select value={filterActive} onChange={(e) => setFilterActive(e.target.value)} className="input text-sm w-full sm:w-32" aria-label="Active filter">
          <option value="all">All</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <select value={filterRecruiter} onChange={(e) => setFilterRecruiter(e.target.value)} className="input text-sm w-full sm:w-44" aria-label="Recruiter filter">
          <option value="all">All recruiters</option>
          {recruiters.map((r) => (
            <option key={r.id} value={r.id}>{r.name || r.email}</option>
          ))}
        </select>
      </div>

      {!loading && <p className="text-xs text-surface-500">Showing {filtered.length} of {candidates.length}</p>}

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner size={28} />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Users size={24} />}
          title="No candidates found"
          description={search ? 'Try a different search' : 'Invite candidates from the Users page'}
          action={
            <Link href="/dashboard/admin/users" className="btn-primary text-sm flex items-center gap-1.5">
              <Send size={14} /> Invite Candidate
            </Link>
          }
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="divide-y divide-surface-50">
            {filtered.map((c) => {
              const latestStatus = c.applications?.[0]?.status;
              const assignedRecruiterIds = assignments[c.id] || [];
              const assignedRecruiters = recruiters.filter((r) => assignedRecruiterIds.includes(r.id));
              const isAssigned = assignedRecruiters.length > 0;

              return (
                <div
                  key={c.id}
                  id={`candidate-row-${c.id}`}
                  className="flex items-center gap-4 px-5 py-3 hover:bg-surface-50 dark:hover:bg-surface-700/30 transition-colors group"
                >
                  <div
                    className="w-10 h-10 rounded-full bg-brand-100 dark:bg-brand-500/30 flex items-center justify-center text-brand-700 dark:text-brand-300 font-bold text-sm shrink-0 cursor-pointer"
                    onClick={() => router.push(`/dashboard/admin/candidates/${c.id}`)}
                  >
                    {c.full_name?.[0] || '?'}
                  </div>

                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => router.push(`/dashboard/admin/candidates/${c.id}`)}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-surface-900 dark:text-surface-100">{c.full_name}</p>
                      {c.rating > 0 && (
                        <div className="flex gap-0.5">
                          {Array.from({ length: c.rating }).map((_, i) => (
                            <Star key={i} size={10} className="text-amber-400 fill-amber-400" />
                          ))}
                        </div>
                      )}
                      <span className={cn(
                        'px-1.5 py-0.5 rounded text-[10px] font-medium',
                        isAssigned ? 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-300' : 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300'
                      )}>
                        {isAssigned ? 'Assigned' : 'Waiting for recruiter'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      <span className="text-xs text-surface-600 dark:text-surface-400 font-medium">
                        {c.primary_title || <span className="italic text-surface-400">No title yet</span>}
                      </span>
                      {c.location && (
                        <span className="text-xs text-surface-400 flex items-center gap-1">
                          <MapPin size={10} />
                          {c.location}
                        </span>
                      )}
                      {c.availability && <span className="text-xs text-surface-400">· {c.availability}</span>}
                    </div>
                  </div>

                  <div className="hidden md:flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                    {!isAssigned ? (
                      <button
                        onClick={() => { setAssignTarget(c); setAssigningId(''); }}
                        className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 px-2 py-1 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 transition-colors"
                      >
                        <UserPlus size={11} /> Assign
                      </button>
                    ) : (
                      <>
                        {assignedRecruiters.slice(0, 2).map((r) => (
                          <span key={r.id} className="px-2 py-0.5 bg-brand-50 dark:bg-brand-500/20 text-brand-700 dark:text-brand-300 rounded-full text-[10px] font-medium">
                            {r.name || r.email}
                          </span>
                        ))}
                        {assignedRecruiters.length > 2 && <span className="text-[10px] text-surface-400">+{assignedRecruiters.length - 2}</span>}
                        <button
                          onClick={() => { setAssignTarget(c); setAssigningId(''); }}
                          className="btn-ghost p-1 text-surface-400 hover:text-brand-600"
                        >
                          <Plus size={12} />
                        </button>
                      </>
                    )}
                  </div>

                  <div className="shrink-0 flex items-center gap-3">
                    {latestStatus && (
                      <span className={cn('px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] font-medium inline-flex', STATUS_COLORS[latestStatus] || 'bg-surface-100 text-surface-600')}>
                        {latestStatus}
                      </span>
                    )}
                    <ChevronRight size={14} className="text-surface-300 group-hover:text-surface-500 cursor-pointer" onClick={() => router.push(`/dashboard/admin/candidates/${c.id}`)} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Assign Recruiter Modal ── */}
      {assignTarget && (
        <Modal open onClose={() => { setAssignTarget(null); setAssigningId(''); }} title={`Assign recruiter — ${assignTarget.full_name}`} size="sm">
          <div className="space-y-4">
            {(assignments[assignTarget.id] || []).length > 0 && (
              <div>
                <p className="text-xs font-medium text-surface-600 mb-2">Currently assigned</p>
                <div className="space-y-1.5">
                  {recruiters
                    .filter((r) => (assignments[assignTarget.id] || []).includes(r.id))
                    .map((r) => (
                      <div key={r.id} className="flex items-center justify-between px-3 py-2 bg-surface-50 dark:bg-surface-700/50 rounded-lg">
                        <div>
                          <p className="text-sm font-medium text-surface-800">{r.name || r.email}</p>
                          <p className="text-xs text-surface-400">{r.email}</p>
                        </div>
                        <button
                          onClick={() => removeRecruiter(assignTarget.id, r.id)}
                          disabled={removingAssign === r.id}
                          className="btn-ghost p-1.5 text-red-400 hover:text-red-600"
                        >
                          {removingAssign === r.id ? <Spinner size={12} /> : <Trash2 size={13} />}
                        </button>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {recruiters.filter((r) => !(assignments[assignTarget.id] || []).includes(r.id)).length > 0 ? (
              <div>
                <p className="text-xs font-medium text-surface-600 mb-2">Add recruiter</p>
                <div className="flex gap-2">
                  <select value={assigningId} onChange={(e) => setAssigningId(e.target.value)} className="input text-sm flex-1" aria-label="Select recruiter">
                    <option value="">Select a recruiter...</option>
                    {recruiters
                      .filter((r) => !(assignments[assignTarget.id] || []).includes(r.id))
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name || r.email}
                        </option>
                      ))}
                  </select>
                  <button onClick={assignRecruiter} disabled={!assigningId || savingAssign} className="btn-primary text-sm px-3">
                    {savingAssign ? <Spinner size={14} /> : <Plus size={14} />}
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-surface-400">All recruiters are already assigned.</p>
            )}

            <div className="flex justify-end pt-2">
              <button onClick={() => { setAssignTarget(null); setAssigningId(''); }} className="btn-secondary text-sm">
                Done
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default function CandidatesPage() {
  return (
    <Suspense fallback={
      <div className="flex justify-center py-12">
        <Spinner size={28} />
      </div>
    }>
      <CandidatesPageContent />
    </Suspense>
  );
}