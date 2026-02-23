'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-browser';
import { Spinner, StatusBadge } from '@/components/ui';
import { Users, Briefcase, User, ChevronRight, BarChart3 } from 'lucide-react';
import { formatDate, cn } from '@/utils/helpers';

const STAGES = [
  { key: 'applied', label: 'Applied', color: 'bg-blue-100 text-blue-700' },
  { key: 'screening', label: 'Screening', color: 'bg-yellow-100 text-yellow-700' },
  { key: 'interview', label: 'Interview', color: 'bg-purple-100 text-purple-700' },
  { key: 'offer', label: 'Offer', color: 'bg-green-100 text-green-700' },
  { key: 'rejected', label: 'Rejected', color: 'bg-red-100 text-red-600' },
];

export default function AdminPipelinePage() {
  const supabase = createClient();
  const [applications, setApplications] = useState<any[]>([]);
  const [recruiters, setRecruiters] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [recruiterFilter, setRecruiterFilter] = useState<string>('all');
  const [stageFilter, setStageFilter] = useState<string>('all');

  const load = useCallback(async () => {
    setLoading(true);
    const [appsRes, recsRes, asgRes] = await Promise.all([
      supabase.from('applications')
        .select('*, candidate:candidates(id, full_name, primary_title, assigned_recruiter_id), job:jobs(title, company)')
        .order('updated_at', { ascending: false }),
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

  const getRecruiterId = (candidateId: string) =>
    assignments[candidateId] || (applications.find(a => a.candidate_id === candidateId)?.candidate as any)?.assigned_recruiter_id;
  const getRecruiterName = (candidateId: string) => {
    const rid = getRecruiterId(candidateId);
    if (!rid) return null;
    const r = recruiters.find(x => x.id === rid);
    return r?.name || r?.email || null;
  };

  const pipelineCounts = STAGES.reduce((acc, s) => {
    acc[s.key] = applications.filter(a => a.status === s.key).length;
    return acc;
  }, {} as Record<string, number>);
  const totalInPipeline = STAGES.reduce((sum, s) => sum + pipelineCounts[s.key], 0);

  let filtered = applications.filter(a => {
    const matchStage = stageFilter === 'all' || a.status === stageFilter;
    const recId = getRecruiterId(a.candidate_id);
    const matchRec = recruiterFilter === 'all' || recId === recruiterFilter;
    return matchStage && matchRec;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 font-display">Pipeline</h1>
          <p className="text-sm text-surface-500 mt-1">Application stages across all candidates · filter by recruiter</p>
        </div>
        <div className="flex items-center gap-3">
          <select value={recruiterFilter} onChange={e => setRecruiterFilter(e.target.value)} className="input text-sm py-2 px-3 w-48">
            <option value="all">All recruiters</option>
            {recruiters.map(r => (
              <option key={r.id} value={r.id}>{r.name || r.email}</option>
            ))}
          </select>
          <Link href="/dashboard/admin/applications" className="btn-secondary text-sm py-2 px-4 flex items-center gap-2">
            View all applications <ChevronRight size={14} />
          </Link>
        </div>
      </div>

      {/* Funnel */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-surface-800 mb-4 flex items-center gap-2">
          <BarChart3 size={16} /> Pipeline funnel
        </h3>
        <div className="flex flex-wrap gap-4">
          {STAGES.map(s => (
            <button
              key={s.key}
              onClick={() => setStageFilter(stageFilter === s.key ? 'all' : s.key)}
              className={cn(
                'px-4 py-2 rounded-xl text-sm font-medium transition-colors',
                stageFilter === s.key ? 'ring-2 ring-offset-2 ring-surface-400 ' + s.color : s.color + ' hover:opacity-90'
              )}
            >
              {s.label} ({pipelineCounts[s.key]})
            </button>
          ))}
        </div>
        <p className="text-xs text-surface-500 mt-3">Total in pipeline: {totalInPipeline} · Click a stage to filter list below</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={28} /></div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-surface-500">{filtered.length} application{filtered.length !== 1 ? 's' : ''}</p>
          {filtered.slice(0, 100).map(a => (
            <div key={a.id} className="card p-4 flex items-center justify-between gap-4 flex-wrap">
              <div className="flex-1 min-w-0">
                <Link href={`/dashboard/admin/candidates/${a.candidate_id}`} className="font-medium text-surface-900 hover:text-brand-600 flex items-center gap-1">
                  {(a.candidate as any)?.full_name} <ChevronRight size={12} />
                </Link>
                <p className="text-sm text-surface-600">{a.job?.title} at {a.job?.company}</p>
                <div className="flex items-center gap-3 mt-0.5 text-xs text-surface-400">
                  {getRecruiterName(a.candidate_id) && <span className="flex items-center gap-1"><User size={10} /> {getRecruiterName(a.candidate_id)}</span>}
                  {a.updated_at && <span>Updated {formatDate(a.updated_at)}</span>}
                </div>
              </div>
              <StatusBadge status={a.status} />
            </div>
          ))}
          {filtered.length > 100 && <p className="text-sm text-surface-500">Showing first 100. Use Applications page for full list and filters.</p>}
        </div>
      )}
    </div>
  );
}
