'use client';
// src/app/dashboard/admin/candidates/page.tsx
import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient, subscribeWithLog } from '@/lib/supabase-browser';
import { SearchInput, EmptyState, Spinner, ToastContainer } from '@/components/ui';
import { useToast, useProfile } from '@/hooks';
import {
  Users,
  RefreshCw,
  AlertCircle,
  Star,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  MapPin,
  Send,
} from 'lucide-react';
import { cn } from '@/utils/helpers';
import Link from 'next/link';

const STATUS_COLORS: Record<string, string> = {
  ready: 'bg-surface-100 dark:bg-surface-600 text-surface-600 dark:text-surface-300',
  applied: 'bg-surface-100 dark:bg-surface-600 text-surface-600 dark:text-surface-300',
  screening: 'bg-surface-100 dark:bg-surface-600 text-surface-600 dark:text-surface-300',
  interview: 'bg-surface-100 dark:bg-surface-600 text-surface-600 dark:text-surface-300',
  offer: 'bg-surface-100 dark:bg-surface-600 text-surface-600 dark:text-surface-300',
  rejected: 'bg-surface-100 dark:bg-surface-600 text-surface-600 dark:text-surface-300',
};

function CandidatesPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile } = useProfile();
  const highlightId = searchParams.get('highlight');
  const supabase = createClient();

  const [candidates, setCandidates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterActive, setFilterActive] = useState('all');
  const [sortBy, setSortBy] = useState<'name' | 'created_at' | 'title'>('created_at');
  const [sortAsc, setSortAsc] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const toggleSort = (col: 'name' | 'created_at' | 'title') => {
    if (sortBy === col) setSortAsc(a => !a);
    else { setSortBy(col); setSortAsc(true); }
  };

  const { toasts, dismiss } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    // Get all valid profile IDs for candidates so we can filter out orphaned rows
    const { data: candidateProfiles } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'candidate');

    const validProfileIds = (candidateProfiles || []).map((p: any) => p.id);

    const [candRes] = await Promise.all([
      supabase
        .from('candidates')
        .select('*, applications(status)')
        .not('invite_accepted_at', 'is', null)
        // Only include candidates whose user_id exists in profiles
        // This filters out orphaned rows left behind after a user is deleted
        .in('user_id', validProfileIds.length > 0 ? validProfileIds : ['00000000-0000-0000-0000-000000000000'])
        .order('created_at', { ascending: false }),
    ]);

    if (candRes.error) setError(candRes.error.message);
    else setCandidates(candRes.data || []);

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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => load());
    subscribeWithLog(channel, 'admin-candidates-realtime');

    return () => {
      supabase.removeChannel(channel);
    };
  }, [load, supabase]);

  const filtered = [...candidates].filter((c) => {
    const matchSearch =
      c.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      c.primary_title?.toLowerCase().includes(search.toLowerCase()) ||
      c.location?.toLowerCase().includes(search.toLowerCase());

    const matchActive = filterActive === 'all' || (filterActive === 'active' ? c.active : !c.active);
    return matchSearch && matchActive;
  });

  filtered.sort((a, b) => {
    const mul = sortAsc ? 1 : -1;
    if (sortBy === 'name') return mul * String(a.full_name || '').localeCompare(String(b.full_name || ''));
    if (sortBy === 'title') return mul * String(a.primary_title || '').localeCompare(String(b.primary_title || ''));
    const da = new Date(a.created_at || 0).getTime();
    const db = new Date(b.created_at || 0).getTime();
    return mul * (da - db);
  });

  const effectiveRole = (profile as (typeof profile & { effective_role?: string }) | null)?.effective_role ?? null;
  const isPlatformAdmin = effectiveRole === 'platform_admin';

  useEffect(() => {
    if (!profile) return;
  }, [profile, effectiveRole, isPlatformAdmin, candidates.length]);

  return (
    <div className="space-y-6">
      <ToastContainer toasts={toasts} dismiss={dismiss} />
      {/* Header */}
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Candidates</h1>
          <p className="admin-page-subtitle">
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
        <div className="rounded-xl border border-surface-300 bg-surface-100 px-4 py-3 text-sm text-surface-800 flex items-center gap-2">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {/* Legacy recruiter-assignment banner removed in new model */}

      {/* Filters */}
      <div className="admin-toolbar items-center">
        <SearchInput value={search} onChange={setSearch} placeholder="Search name, title, location..." />
        <select value={filterActive} onChange={(e) => setFilterActive(e.target.value)} className="input text-sm w-full sm:w-32" aria-label="Active filter">
          <option value="all">All</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        {/* Recruiter filter removed in new model */}
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
        <div className="card overflow-hidden min-w-0">
          <div className="divide-y divide-surface-50 min-w-0 overflow-x-auto">
            <div className="flex items-center gap-2 sm:gap-4 px-3 sm:px-5 py-3 bg-surface-100 text-xs font-semibold text-surface-600 uppercase tracking-wide">
              <div className="w-10 shrink-0" />
              <div className="flex-1 flex items-center gap-2 min-w-0">
                <button onClick={() => toggleSort('name')} className="flex items-center gap-1 hover:text-surface-900">
                  Name {sortBy === 'name' ? (sortAsc ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : null}
                </button>
                <span className="text-surface-400">·</span>
                <button onClick={() => toggleSort('title')} className="flex items-center gap-1 hover:text-surface-900">
                  Title {sortBy === 'title' ? (sortAsc ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : null}
                </button>
              </div>
              <div className="hidden md:block w-24" />
              <button onClick={() => toggleSort('created_at')} className="shrink-0 flex items-center gap-1 hover:text-surface-900">
                Added {sortBy === 'created_at' ? (sortAsc ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : null}
              </button>
            </div>
            {filtered.map((c) => {
              const latestStatus = c.applications?.[0]?.status;
              return (
                <div
                  key={c.id}
                  id={`candidate-row-${c.id}`}
                  className="flex items-center gap-2 sm:gap-4 px-3 sm:px-5 py-3 hover:bg-surface-100 transition-colors group min-w-0"
                >
                  <div
                    className="w-10 h-10 rounded-full bg-surface-900 flex items-center justify-center text-surface-50 font-bold text-sm shrink-0 cursor-pointer"
                    onClick={() => router.push(`/dashboard/admin/candidates/${c.id}`)}
                  >
                    {c.full_name?.[0] || '?'}
                  </div>

                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => router.push(`/dashboard/admin/candidates/${c.id}`)}>
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <p className="text-sm font-semibold text-surface-900 truncate max-w-[180px] sm:max-w-none">{c.full_name}</p>
                      {c.rating > 0 && (
                        <div className="flex gap-0.5">
                          {Array.from({ length: c.rating }).map((_, i) => (
                            <Star key={i} size={10} className="text-amber-400 fill-amber-400" />
                          ))}
                        </div>
                      )}
                      {/* Recruiter assignment status badge removed in new model */}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      <span className="text-xs text-surface-600 font-medium">
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

                  {/* Per-candidate recruiter assignment controls removed in new model */}

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

      {/* Assign recruiter modal removed in new model */}
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