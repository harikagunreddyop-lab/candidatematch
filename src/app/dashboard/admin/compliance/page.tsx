'use client';
import { useState, useEffect, useCallback } from 'react';
import { Spinner } from '@/components/ui';
import { Shield, FileText, Trash2, Clock, CheckCircle, XCircle, AlertTriangle, ChevronDown, Save } from 'lucide-react';
import { formatDate, formatRelative } from '@/utils/helpers';

type Tab = 'overview' | 'deletion' | 'retention' | 'consent';

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  approved: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  processing: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  completed: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  rejected: 'bg-red-500/10 text-red-400 border-red-500/20',
};

export default function AdminCompliancePage() {
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [stats, setStats] = useState<any>(null);
  const [deletionRequests, setDeletionRequests] = useState<any[]>([]);
  const [retentionPolicies, setRetentionPolicies] = useState<any[]>([]);
  const [consents, setConsents] = useState<any[]>([]);

  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [editingPolicy, setEditingPolicy] = useState<string | null>(null);
  const [policyEdits, setPolicyEdits] = useState<Record<string, { retention_days?: number; auto_delete?: boolean }>>({});
  const [message, setMessage] = useState<string | null>(null);

  const apiFetch = useCallback(async (params: string) => {
    const res = await fetch(`/api/compliance?${params}`);
    if (!res.ok) throw new Error((await res.json()).error || res.statusText);
    return res.json();
  }, []);

  const apiPost = useCallback(async (body: any) => {
    const res = await fetch('/api/compliance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.statusText);
    return data;
  }, []);

  const loadTab = useCallback(async (t: Tab) => {
    setLoading(true);
    setError(null);
    try {
      if (t === 'overview') {
        const data = await apiFetch('type=stats');
        setStats(data);
      } else if (t === 'deletion') {
        const data = await apiFetch('type=deletion-requests');
        setDeletionRequests(data.requests || []);
      } else if (t === 'retention') {
        const data = await apiFetch('type=retention-policies');
        setRetentionPolicies(data.policies || []);
      } else if (t === 'consent') {
        const data = await apiFetch('type=consent');
        setConsents(data.consents || []);
      }
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  }, [apiFetch]);

  useEffect(() => { loadTab(tab); }, [tab, loadTab]);

  const handleReview = async (requestId: string, status: 'approved' | 'rejected') => {
    setActionLoading(requestId);
    setMessage(null);
    try {
      await apiPost({ action: 'review_deletion', request_id: requestId, status, review_notes: reviewNotes[requestId] || '' });
      setMessage(`Request ${status}`);
      loadTab('deletion');
    } catch (e: any) {
      setError(e.message);
    }
    setActionLoading(null);
  };

  const handleExecute = async (requestId: string) => {
    if (!confirm('This will permanently delete/anonymize user data. Continue?')) return;
    setActionLoading(requestId);
    setMessage(null);
    try {
      await apiPost({ action: 'execute_deletion', request_id: requestId });
      setMessage('Deletion executed successfully');
      loadTab('deletion');
    } catch (e: any) {
      setError(e.message);
    }
    setActionLoading(null);
  };

  const handleSavePolicy = async (policyId: string) => {
    const edits = policyEdits[policyId];
    if (!edits) return;
    setActionLoading(policyId);
    setMessage(null);
    try {
      await apiPost({ action: 'update_retention', policy_id: policyId, ...edits });
      setMessage('Policy updated');
      setEditingPolicy(null);
      setPolicyEdits(prev => { const n = { ...prev }; delete n[policyId]; return n; });
      loadTab('retention');
    } catch (e: any) {
      setError(e.message);
    }
    setActionLoading(null);
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <Shield size={16} /> },
    { id: 'deletion', label: 'Deletion Requests', icon: <Trash2 size={16} /> },
    { id: 'retention', label: 'Retention Policies', icon: <Clock size={16} /> },
    { id: 'consent', label: 'Consent Audit', icon: <FileText size={16} /> },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-surface-900 dark:text-surface-100 font-display">Compliance & Data Governance</h1>
        <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">Manage consent, data deletion, and retention policies</p>
      </div>

      {message && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400 flex items-center gap-2">
          <CheckCircle size={16} /> {message}
          <button onClick={() => setMessage(null)} className="ml-auto text-emerald-300 hover:text-white">&times;</button>
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400 flex items-center gap-2">
          <AlertTriangle size={16} /> {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-300 hover:text-white">&times;</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-surface-200 dark:border-surface-700 pb-px">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 sm:px-4 py-2.5 text-sm font-medium rounded-t-lg whitespace-nowrap transition-colors ${
              tab === t.id
                ? 'text-brand-400 border-b-2 border-brand-400 bg-brand-500/5'
                : 'text-surface-500 dark:text-surface-400 hover:text-surface-900 dark:hover:text-surface-200'
            }`}
          >
            {t.icon} <span className="hidden sm:inline">{t.label}</span>
            <span className="sm:hidden">{t.label.split(' ')[0]}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size={28} /></div>
      ) : (
        <>
          {/* Overview Tab */}
          {tab === 'overview' && stats && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <StatCard label="Total Consent Records" value={stats.total_consent_records} icon={<FileText size={20} className="text-brand-400" />} />
                <StatCard label="Profiles with Consent" value={stats.profiles_with_consent} icon={<CheckCircle size={20} className="text-emerald-400" />} />
                <StatCard label="Pending Deletions" value={stats.deletion_requests?.pending || 0} icon={<Clock size={20} className="text-amber-400" />} />
                <StatCard label="Completed Deletions" value={stats.deletion_requests?.completed || 0} icon={<Trash2 size={20} className="text-red-400" />} />
              </div>

              {/* Deletion breakdown */}
              {Object.keys(stats.deletion_requests || {}).length > 0 && (
                <div className="rounded-2xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-4 sm:p-6 shadow-sm">
                  <h3 className="text-sm font-bold text-surface-900 dark:text-surface-100 font-display mb-4">Deletion Requests by Status</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    {['pending', 'approved', 'processing', 'completed', 'rejected'].map(s => (
                      <div key={s} className="text-center p-3 rounded-xl bg-surface-50 dark:bg-surface-700/50">
                        <p className="text-xl font-bold text-surface-900 dark:text-surface-100">{stats.deletion_requests?.[s] || 0}</p>
                        <p className="text-xs text-surface-500 dark:text-surface-400 capitalize mt-1">{s}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Retention overview */}
              {stats.retention_policies?.length > 0 && (
                <div className="rounded-2xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-4 sm:p-6 shadow-sm">
                  <h3 className="text-sm font-bold text-surface-900 dark:text-surface-100 font-display mb-4">Retention Policies</h3>
                  <div className="space-y-2">
                    {stats.retention_policies.map((p: any) => (
                      <div key={p.id} className="flex items-center justify-between py-2 border-b border-surface-100 dark:border-surface-700 last:border-0">
                        <div>
                          <p className="text-sm font-medium text-surface-900 dark:text-surface-100 capitalize">{p.data_category.replace(/_/g, ' ')}</p>
                          <p className="text-xs text-surface-500 dark:text-surface-400">{p.description}</p>
                        </div>
                        <div className="text-right shrink-0 ml-4">
                          <p className="text-sm font-bold text-surface-900 dark:text-surface-100">{p.retention_days}d</p>
                          {p.auto_delete && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">auto-delete</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Deletion Requests Tab */}
          {tab === 'deletion' && (
            <div className="space-y-4">
              {deletionRequests.length === 0 ? (
                <div className="rounded-2xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-8 text-center">
                  <Trash2 size={32} className="mx-auto text-surface-400 mb-3" />
                  <p className="text-sm text-surface-500 dark:text-surface-400">No deletion requests</p>
                </div>
              ) : (
                deletionRequests.map((r: any) => (
                  <div key={r.id} className="rounded-2xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-4 sm:p-6 shadow-sm">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLORS[r.status] || 'bg-surface-500/10 text-surface-400'}`}>
                            {r.status}
                          </span>
                          <span className="text-xs text-surface-500 dark:text-surface-400">
                            {formatRelative(r.requested_at)}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-surface-900 dark:text-surface-100 truncate">
                          {r.profile?.name || r.profile?.email || r.profile_id}
                        </p>
                        {r.profile?.email && (
                          <p className="text-xs text-surface-500 dark:text-surface-400">{r.profile.email}</p>
                        )}
                        {r.reason && (
                          <p className="text-xs text-surface-600 dark:text-surface-300 mt-1">Reason: {r.reason}</p>
                        )}
                        {r.review_notes && (
                          <p className="text-xs text-surface-500 dark:text-surface-400 italic mt-1">Notes: {r.review_notes}</p>
                        )}
                      </div>

                      {r.status === 'pending' && (
                        <div className="flex flex-col gap-2 shrink-0">
                          <input
                            type="text"
                            placeholder="Review notes..."
                            value={reviewNotes[r.id] || ''}
                            onChange={e => setReviewNotes(prev => ({ ...prev, [r.id]: e.target.value }))}
                            className="input text-xs py-1.5 px-3 w-full sm:w-48"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleReview(r.id, 'approved')}
                              disabled={actionLoading === r.id}
                              className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1"
                            >
                              {actionLoading === r.id ? <Spinner size={12} /> : <CheckCircle size={14} />} Approve
                            </button>
                            <button
                              onClick={() => handleReview(r.id, 'rejected')}
                              disabled={actionLoading === r.id}
                              className="btn-outline text-xs py-1.5 px-3 flex items-center gap-1 text-red-400 border-red-500/30 hover:bg-red-500/10"
                            >
                              <XCircle size={14} /> Reject
                            </button>
                          </div>
                        </div>
                      )}

                      {r.status === 'approved' && (
                        <button
                          onClick={() => handleExecute(r.id)}
                          disabled={actionLoading === r.id}
                          className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1 bg-red-600 hover:bg-red-700 shrink-0"
                        >
                          {actionLoading === r.id ? <Spinner size={12} /> : <Trash2 size={14} />} Execute Deletion
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Retention Policies Tab */}
          {tab === 'retention' && (
            <div className="rounded-2xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800">
                      <th className="text-left px-4 sm:px-6 py-3 text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wider">Category</th>
                      <th className="text-left px-4 sm:px-6 py-3 text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wider">Retention</th>
                      <th className="text-left px-4 sm:px-6 py-3 text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wider">Auto-delete</th>
                      <th className="text-left px-4 sm:px-6 py-3 text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wider hidden sm:table-cell">Description</th>
                      <th className="text-right px-4 sm:px-6 py-3 text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {retentionPolicies.map((p: any) => (
                      <tr key={p.id} className="border-b border-surface-100 dark:border-surface-700 last:border-0">
                        <td className="px-4 sm:px-6 py-3">
                          <span className="font-medium text-surface-900 dark:text-surface-100 capitalize">{p.data_category.replace(/_/g, ' ')}</span>
                        </td>
                        <td className="px-4 sm:px-6 py-3">
                          {editingPolicy === p.id ? (
                            <input
                              type="number"
                              min={1}
                              value={policyEdits[p.id]?.retention_days ?? p.retention_days}
                              onChange={e => setPolicyEdits(prev => ({ ...prev, [p.id]: { ...prev[p.id], retention_days: Number(e.target.value) } }))}
                              className="input text-xs py-1 px-2 w-20"
                            />
                          ) : (
                            <span className="text-surface-700 dark:text-surface-300">{p.retention_days} days</span>
                          )}
                        </td>
                        <td className="px-4 sm:px-6 py-3">
                          {editingPolicy === p.id ? (
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={policyEdits[p.id]?.auto_delete ?? p.auto_delete}
                                onChange={e => setPolicyEdits(prev => ({ ...prev, [p.id]: { ...prev[p.id], auto_delete: e.target.checked } }))}
                                className="rounded border-surface-300 dark:border-surface-600"
                              />
                              <span className="text-xs text-surface-600 dark:text-surface-300">Yes</span>
                            </label>
                          ) : (
                            p.auto_delete
                              ? <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">Yes</span>
                              : <span className="text-xs text-surface-500 dark:text-surface-400">No</span>
                          )}
                        </td>
                        <td className="px-4 sm:px-6 py-3 text-xs text-surface-500 dark:text-surface-400 hidden sm:table-cell">{p.description}</td>
                        <td className="px-4 sm:px-6 py-3 text-right">
                          {editingPolicy === p.id ? (
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={() => handleSavePolicy(p.id)}
                                disabled={actionLoading === p.id}
                                className="btn-primary text-xs py-1 px-2.5 flex items-center gap-1"
                              >
                                {actionLoading === p.id ? <Spinner size={12} /> : <Save size={12} />} Save
                              </button>
                              <button
                                onClick={() => { setEditingPolicy(null); setPolicyEdits(prev => { const n = { ...prev }; delete n[p.id]; return n; }); }}
                                className="btn-outline text-xs py-1 px-2.5"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setEditingPolicy(p.id)}
                              className="text-xs text-brand-400 hover:text-brand-300 font-medium"
                            >
                              Edit
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Consent Audit Tab */}
          {tab === 'consent' && (
            <div className="space-y-3">
              {consents.length === 0 ? (
                <div className="rounded-2xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-8 text-center">
                  <FileText size={32} className="mx-auto text-surface-400 mb-3" />
                  <p className="text-sm text-surface-500 dark:text-surface-400">No consent records found</p>
                </div>
              ) : (
                <div className="rounded-2xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800">
                          <th className="text-left px-4 sm:px-6 py-3 text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wider">Type</th>
                          <th className="text-left px-4 sm:px-6 py-3 text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wider">Status</th>
                          <th className="text-left px-4 sm:px-6 py-3 text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wider hidden sm:table-cell">IP</th>
                          <th className="text-left px-4 sm:px-6 py-3 text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wider">Date</th>
                          <th className="text-left px-4 sm:px-6 py-3 text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wider hidden sm:table-cell">Version</th>
                        </tr>
                      </thead>
                      <tbody>
                        {consents.map((c: any) => (
                          <tr key={c.id} className="border-b border-surface-100 dark:border-surface-700 last:border-0">
                            <td className="px-4 sm:px-6 py-3">
                              <span className="font-medium text-surface-900 dark:text-surface-100 capitalize">{c.consent_type.replace(/_/g, ' ')}</span>
                            </td>
                            <td className="px-4 sm:px-6 py-3">
                              {c.granted ? (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Granted</span>
                              ) : (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">Revoked</span>
                              )}
                            </td>
                            <td className="px-4 sm:px-6 py-3 text-xs text-surface-500 dark:text-surface-400 hidden sm:table-cell">{c.ip_address}</td>
                            <td className="px-4 sm:px-6 py-3 text-xs text-surface-500 dark:text-surface-400">{formatDate(c.created_at)}</td>
                            <td className="px-4 sm:px-6 py-3 text-xs text-surface-500 dark:text-surface-400 hidden sm:table-cell">v{c.version}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: number | string; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-4 sm:p-6 shadow-sm flex items-start gap-4">
      <div className="p-2.5 rounded-xl bg-surface-50 dark:bg-surface-700/50">{icon}</div>
      <div>
        <p className="text-2xl font-bold text-surface-900 dark:text-surface-100">{value}</p>
        <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">{label}</p>
      </div>
    </div>
  );
}
