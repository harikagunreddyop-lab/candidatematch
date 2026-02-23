'use client';
import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { EmptyState, Spinner, SearchInput } from '@/components/ui';
import { Link2, Plus, Trash2, Users, Briefcase, RefreshCw, AlertCircle, CheckCircle2, X } from 'lucide-react';
import { logAudit } from '@/lib/audit';
import { formatRelative, cn } from '@/utils/helpers';

type Assignment = {
  recruiter_id: string;
  candidate_id: string;
  assigned_at: string;
  recruiter?: { name: string; email: string };
  candidate?: { full_name: string; email: string; primary_title: string };
};

export default function AssignmentsPage() {
  const supabase = createClient();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [recruiters, setRecruiters] = useState<any[]>([]);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [formRecruiter, setFormRecruiter] = useState('');
  const [formCandidates, setFormCandidates] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const [asgn, recs, cands] = await Promise.all([
      supabase.from('recruiter_candidate_assignments')
        .select('*, recruiter:profiles!recruiter_id(name, email), candidate:candidates!candidate_id(full_name, email, primary_title)')
        .order('assigned_at', { ascending: false }),
      supabase.from('profiles').select('id, name, email').eq('role', 'recruiter').order('name'),
      supabase.from('candidates').select('id, full_name, email, primary_title, user_id').eq('active', true).not('invite_accepted_at', 'is', null).order('full_name'),
    ]);
    const err = asgn.error?.message || recs.error?.message || cands.error?.message;
    if (err) {
      setLoadError(err);
      setAssignments([]);
      setRecruiters([]);
      setCandidates([]);
    } else {
      setAssignments(asgn.data || []);
      setRecruiters(recs.data || []);
      const { data: candProfiles } = await supabase.from('profiles').select('id').eq('role', 'candidate');
      const candProfileIdArr = (candProfiles || []).map((p: any) => p.id as string);
      const candProfileSet: Record<string, boolean> = {};
      for (const id of candProfileIdArr) candProfileSet[id] = true;
      setCandidates((cands.data || []).filter((c: any) => candProfileSet[c.user_id]));
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAssign = async () => {
    if (!formRecruiter || formCandidates.length === 0) {
      setError('Select a recruiter and at least one candidate');
      return;
    }
    setSaving(true);
    setError(null);

    const rows = formCandidates.map(cid => ({
      recruiter_id: formRecruiter,
      candidate_id: cid,
    }));

    const { error: err } = await supabase.from('recruiter_candidate_assignments')
      .upsert(rows, { onConflict: 'recruiter_id,candidate_id' });

    if (err) {
      setError(err.message);
    } else {
      try { await logAudit({ action: 'assignment.create', resourceType: 'recruiter_candidate_assignments', details: { recruiter_id: formRecruiter, candidate_ids: formCandidates, count: formCandidates.length } }); } catch (_) {}
      // Sync assigned_recruiter_id so candidate messages and admin views stay consistent
      for (const cid of formCandidates) {
        await supabase.from('candidates').update({ assigned_recruiter_id: formRecruiter, updated_at: new Date().toISOString() }).eq('id', cid);
      }
      setSuccess(`Assigned ${formCandidates.length} candidate(s)`);
      setShowForm(false);
      setFormRecruiter('');
      setFormCandidates([]);
      await load();
      setTimeout(() => setSuccess(null), 3000);
    }
    setSaving(false);
  };

  const handleRemove = async (recruiterId: string, candidateId: string) => {
    const key = `${recruiterId}-${candidateId}`;
    setRemoving(key);
    await supabase.from('recruiter_candidate_assignments')
      .delete()
      .eq('recruiter_id', recruiterId)
      .eq('candidate_id', candidateId);
    try { await logAudit({ action: 'assignment.remove', resourceType: 'recruiter_candidate_assignments', resourceId: candidateId, details: { recruiter_id: recruiterId } }); } catch (_) {}
    // Sync assigned_recruiter_id: set to another assigned recruiter or null
    const { data: remaining } = await supabase.from('recruiter_candidate_assignments').select('recruiter_id').eq('candidate_id', candidateId).order('assigned_at', { ascending: true }).limit(1);
    const nextRecruiterId = remaining?.[0]?.recruiter_id ?? null;
    await supabase.from('candidates').update({ assigned_recruiter_id: nextRecruiterId, updated_at: new Date().toISOString() }).eq('id', candidateId);
    await load();
    setRemoving(null);
  };

  const toggleCandidate = (cid: string) => {
    setFormCandidates(prev =>
      prev.includes(cid) ? prev.filter(id => id !== cid) : [...prev, cid]
    );
  };

  // Group assignments by recruiter
  const grouped = assignments.reduce<Record<string, Assignment[]>>((acc, a) => {
    const key = a.recruiter_id;
    if (!acc[key]) acc[key] = [];
    acc[key].push(a);
    return acc;
  }, {});

  const filtered = search
    ? assignments.filter(a =>
        a.recruiter?.name?.toLowerCase().includes(search.toLowerCase()) ||
        a.recruiter?.email?.toLowerCase().includes(search.toLowerCase()) ||
        a.candidate?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
        a.candidate?.email?.toLowerCase().includes(search.toLowerCase())
      )
    : assignments;

  // Get already-assigned candidate IDs for selected recruiter
  const assignedForRecruiter = new Set(
    assignments.filter(a => a.recruiter_id === formRecruiter).map(a => a.candidate_id)
  );
  const unassignedCandidates = candidates.filter(c => !assignedForRecruiter.has(c.id));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 font-display">Assignments</h1>
          <p className="text-sm text-surface-500 mt-1">
            {assignments.length} assignment{assignments.length !== 1 ? 's' : ''} · {Object.keys(grouped).length} recruiter{Object.keys(grouped).length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="btn-ghost text-sm flex items-center gap-1.5">
            <RefreshCw size={14} /> Refresh
          </button>
          <button onClick={() => { setShowForm(true); setError(null); }}
            className="btn-primary text-sm flex items-center gap-1.5">
            <Plus size={16} /> Assign Recruiter
          </button>
        </div>
      </div>

      {success && (
        <div className="rounded-xl border border-green-200 dark:border-green-500/40 bg-green-50 dark:bg-green-900/30 px-4 py-3 text-sm text-green-700 dark:text-green-200 flex items-center gap-2">
          <CheckCircle2 size={14} /> {success}
        </div>
      )}

      <SearchInput value={search} onChange={setSearch} placeholder="Search by recruiter or candidate name..." />

      {loadError && (
        <div className="rounded-xl border border-red-200 dark:border-red-500/40 bg-red-50 dark:bg-red-900/30 px-4 py-3 text-sm text-red-700 dark:text-red-200 flex items-center justify-between gap-2">
          <span className="flex items-center gap-2"><AlertCircle size={14} /> Failed to load: {loadError}</span>
          <button type="button" onClick={() => load()} className="btn-secondary text-xs">Try again</button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={28} /></div>
      ) : loadError ? null : filtered.length === 0 ? (
        <EmptyState icon={<Link2 size={24} />} title="No assignments"
          description="Assign recruiters to candidates so they can manage their pipeline"
          action={<button onClick={() => setShowForm(true)} className="btn-primary text-sm"><Plus size={16} /> Assign Recruiter</button>} />
      ) : search ? (
        /* Flat list when searching */
        <div className="table-container">
          <table>
            <thead><tr><th>Recruiter</th><th>Candidate</th><th>Title</th><th>Assigned</th><th></th></tr></thead>
            <tbody>
              {filtered.map(a => {
                const key = `${a.recruiter_id}-${a.candidate_id}`;
                return (
                  <tr key={key}>
                    <td className="font-medium text-surface-900 dark:text-surface-100">{a.recruiter?.name || a.recruiter?.email}</td>
                    <td>{a.candidate?.full_name}</td>
                    <td className="text-surface-500 dark:text-surface-400 text-xs">{a.candidate?.primary_title}</td>
                    <td className="text-surface-400 dark:text-surface-500 text-xs">{formatRelative(a.assigned_at)}</td>
                    <td>
                      <button onClick={() => handleRemove(a.recruiter_id, a.candidate_id)}
                        disabled={removing === key}
                        className="btn-ghost p-1.5 text-red-400 hover:text-red-600">
                        {removing === key ? <Spinner size={12} /> : <Trash2 size={14} />}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* Grouped by recruiter */
        <div className="space-y-4">
          {Object.entries(grouped).map(([recruiterId, items]) => {
            const recruiter = items[0]?.recruiter;
            return (
              <div key={recruiterId} className="card overflow-hidden">
                <div className="px-5 py-3 bg-surface-50 dark:bg-surface-700/50 border-b border-surface-200 dark:border-surface-600 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-500/30 flex items-center justify-center text-indigo-700 dark:text-indigo-300 font-bold text-xs shrink-0">
                    {(recruiter?.name || recruiter?.email || '?')[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-surface-800 dark:text-surface-200">{recruiter?.name || recruiter?.email}</p>
                    <p className="text-xs text-surface-400 dark:text-surface-500">{recruiter?.email} · {items.length} candidate{items.length !== 1 ? 's' : ''}</p>
                  </div>
                </div>
                <div className="divide-y divide-surface-50 dark:divide-surface-700">
                  {items.map(a => {
                    const key = `${a.recruiter_id}-${a.candidate_id}`;
                    return (
                      <div key={key} className="px-5 py-2.5 flex items-center justify-between hover:bg-surface-50 dark:hover:bg-surface-700/50 transition-colors">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-7 h-7 rounded-full bg-brand-100 dark:bg-brand-500/25 flex items-center justify-center text-brand-700 dark:text-brand-300 font-bold text-[10px] shrink-0">
                            {a.candidate?.full_name?.[0] || '?'}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-surface-800 dark:text-surface-200 truncate">{a.candidate?.full_name}</p>
                            <p className="text-xs text-surface-400 dark:text-surface-500 truncate">{a.candidate?.primary_title}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] text-surface-400 dark:text-surface-500">{formatRelative(a.assigned_at)}</span>
                          <button onClick={() => handleRemove(a.recruiter_id, a.candidate_id)}
                            disabled={removing === key}
                            className="btn-ghost p-1 text-red-400 hover:text-red-600">
                            {removing === key ? <Spinner size={12} /> : <Trash2 size={13} />}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Assign Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-surface-800 rounded-2xl shadow-xl w-full max-w-lg p-4 sm:p-6 space-y-4 max-h-[85vh] flex flex-col border border-surface-200 dark:border-surface-600">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-surface-900 dark:text-surface-100">Assign Recruiter to Candidates</h3>
              <button onClick={() => setShowForm(false)} className="btn-ghost p-1.5"><X size={16} /></button>
            </div>

            {error && (
              <div className="rounded-xl border border-red-200 dark:border-red-500/40 bg-red-50 dark:bg-red-900/30 px-4 py-3 text-xs text-red-700 dark:text-red-200 flex items-center gap-2">
                <AlertCircle size={12} /> {error}
              </div>
            )}

            {recruiters.length === 0 ? (
              <div className="py-8 text-center text-sm text-surface-500 dark:text-surface-400">
                No recruiters found. Go to <strong>Users</strong> page and set a user's role to "recruiter" first.
              </div>
            ) : (
              <>
                <div>
                  <label className="label text-xs">Recruiter</label>
                  <select value={formRecruiter} onChange={e => { setFormRecruiter(e.target.value); setFormCandidates([]); }}
                    className="input text-sm">
                    <option value="">Select recruiter...</option>
                    {recruiters.map(r => (
                      <option key={r.id} value={r.id}>{r.name || r.email}</option>
                    ))}
                  </select>
                </div>

                {formRecruiter && (
                  <div className="flex-1 min-h-0">
                    <label className="label text-xs mb-2">
                      Candidates ({formCandidates.length} selected)
                      {unassignedCandidates.length < candidates.length && (
                        <span className="text-surface-400 font-normal"> · already-assigned hidden</span>
                      )}
                    </label>
                    <div className="border border-surface-200 rounded-xl overflow-y-auto max-h-60 divide-y divide-surface-50">
                      {unassignedCandidates.length === 0 ? (
                        <p className="p-4 text-sm text-surface-400 text-center">All candidates already assigned to this recruiter</p>
                      ) : unassignedCandidates.map(c => (
                        <label key={c.id}
                          className={cn(
                            'flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors',
                            formCandidates.includes(c.id) ? 'bg-brand-50' : 'hover:bg-surface-50'
                          )}>
                          <input type="checkbox" checked={formCandidates.includes(c.id)}
                            onChange={() => toggleCandidate(c.id)}
                            className="rounded border-surface-300 text-brand-600 focus:ring-brand-500" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-surface-800 truncate">{c.full_name}</p>
                            <p className="text-xs text-surface-400 truncate">{c.primary_title} · {c.email || 'no email'}</p>
                          </div>
                        </label>
                      ))}
                    </div>

                    {unassignedCandidates.length > 0 && (
                      <button onClick={() => setFormCandidates(
                        formCandidates.length === unassignedCandidates.length ? [] : unassignedCandidates.map(c => c.id)
                      )} className="text-xs text-brand-600 hover:underline mt-2">
                        {formCandidates.length === unassignedCandidates.length ? 'Deselect all' : 'Select all'}
                      </button>
                    )}
                  </div>
                )}
              </>
            )}

            <div className="flex justify-end gap-3 pt-3 border-t border-surface-200">
              <button onClick={() => setShowForm(false)} className="btn-secondary text-sm">Cancel</button>
              <button onClick={handleAssign} disabled={saving || !formRecruiter || formCandidates.length === 0}
                className="btn-primary text-sm min-w-[140px]">
                {saving ? <Spinner size={14} /> : `Assign ${formCandidates.length || ''} Candidate${formCandidates.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
