'use client';
// src/app/dashboard/recruiter/candidates/page.tsx
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import { SearchInput, EmptyState, Spinner } from '@/components/ui';
import { Users, MapPin, Star, ChevronRight } from 'lucide-react';
import { cn } from '@/utils/helpers';

function safeArray(val: any): any[] {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') { if (val === '{}') return []; try { return JSON.parse(val); } catch { return []; } }
  return [];
}

export default function RecruiterCandidatesPage() {
  const router = useRouter();
  const supabase = createClient();

  const [candidates, setCandidates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    // Get all candidate IDs assigned to this recruiter
    const { data: assignments } = await supabase
      .from('recruiter_candidate_assignments')
      .select('candidate_id')
      .eq('recruiter_id', user.id);

    if (!assignments || assignments.length === 0) { setCandidates([]); setLoading(false); return; }

    const ids = assignments.map((a: any) => a.candidate_id);

    const { data } = await supabase
      .from('candidates')
      .select('*, applications(status, updated_at)')
      .in('id', ids)
      .order('created_at', { ascending: false });

    setCandidates(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const channel = supabase.channel('recruiter-candidates-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recruiter_candidate_assignments' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'candidates' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'applications' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load, supabase]);

  const filtered = candidates.filter(c => {
    const matchSearch =
      c.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      c.primary_title?.toLowerCase().includes(search.toLowerCase()) ||
      c.location?.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === 'all' || (filter === 'active' && c.active);
    return matchSearch && matchFilter;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-100 font-display">My Candidates</h1>
        <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">{candidates.length} assigned to you</p>
      </div>

      <div className="flex gap-3 flex-wrap">
        <SearchInput value={search} onChange={setSearch} placeholder="Search candidates..." />
        <select value={filter} onChange={e => setFilter(e.target.value)} className="input text-sm w-full sm:w-44" aria-label="Filter">
          <option value="all">All candidates</option>
          <option value="active">Active</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={28} /></div>
      ) : candidates.length === 0 ? (
        <EmptyState
          icon={<Users size={24} />}
          title="No candidates assigned yet"
          description="Your admin will assign candidates to you — they'll appear here instantly when assigned."
        />
      ) : filtered.length === 0 ? (
        <EmptyState icon={<Users size={24} />} title="No matches" description="Try a different search or filter" />
      ) : (
        <div className="card overflow-hidden">
          <div className="divide-y divide-surface-100 dark:divide-surface-700">
            {filtered.map(c => {
              const sortedApps = [...(c.applications || [])].sort((a: any, b: any) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
              const latestStatus = sortedApps[0]?.status;
              const skills = safeArray(c.skills).slice(0, 4);

              return (
                <div key={c.id}
                  onClick={() => router.push(`/dashboard/recruiter/candidates/${c.id}`)}
                  className="flex items-center gap-4 px-5 py-4 hover:bg-surface-50 dark:hover:bg-surface-700/30 cursor-pointer transition-colors group">
                  <div className="w-10 h-10 rounded-full bg-brand-100 dark:bg-brand-500/30 flex items-center justify-center text-brand-700 dark:text-brand-300 font-bold text-sm shrink-0">
                    {c.full_name?.[0] || '?'}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-surface-900 dark:text-surface-100">{c.full_name}</p>
                      {c.rating > 0 && (
                        <div className="flex gap-0.5">
                          {Array.from({ length: c.rating }).map((_: any, i: number) => (
                            <Star key={i} size={10} className="text-amber-400 fill-amber-400" />
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      <span className="text-xs text-surface-600 font-medium">
                        {c.primary_title || <span className="italic text-surface-400">No title yet</span>}
                      </span>
                      {c.location && <span className="text-xs text-surface-400 flex items-center gap-0.5"><MapPin size={10} />{c.location}</span>}
                    </div>
                    {skills.length > 0 && (
                      <div className="flex gap-1 mt-1.5 flex-wrap">
                        {skills.map((s: string, i: number) => (
                          <span key={i} className="px-1.5 py-0.5 bg-brand-50 dark:bg-brand-500/20 text-brand-600 dark:text-brand-300 rounded text-[10px]">{s}</span>
                        ))}
                        {safeArray(c.skills).length > 4 && (
                          <span className="text-[10px] text-surface-400">+{safeArray(c.skills).length - 4}</span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="shrink-0 flex items-center gap-3">
                    {latestStatus && (
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-blue-50 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 hidden sm:block">
                        {latestStatus}
                      </span>
                    )}
                    <ChevronRight size={14} className="text-surface-300 group-hover:text-surface-500" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}