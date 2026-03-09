'use client';
import { useState, useEffect, useCallback } from 'react';
import { Spinner } from '@/components/ui';
import { FileText } from 'lucide-react';
import { formatRelative } from '@/utils/helpers';

interface ActivityEntry {
  id: string;
  company_id: string | null;
  user_id: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  actor_name?: string | null;
}

export default function AdminAuditPage() {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(100);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const res = await fetch(`/api/activity?limit=${limit}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setLoadError(err.error || res.statusText || 'Failed to load activity');
      setEntries([]);
    } else {
      const data = await res.json();
      setEntries(data.entries ?? []);
    }
    setLoading(false);
  }, [limit]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Audit Log</h1>
          <p className="admin-page-subtitle">Recent actions: jobs created, candidate contact views.</p>
        </div>
        <select value={limit} onChange={e => setLimit(Number(e.target.value))} className="input text-sm py-2 px-3 w-full sm:w-28">
          <option value={50}>Last 50</option>
          <option value={100}>Last 100</option>
          <option value={250}>Last 250</option>
          <option value={500}>Last 500</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={28} /></div>
      ) : loadError ? (
        <div className="card p-12 text-center">
          <p className="text-surface-700 font-medium">Failed to load activity</p>
          <p className="text-sm text-surface-500 mt-1">{loadError}</p>
          <button type="button" onClick={() => load()} className="btn-primary mt-4">Try again</button>
        </div>
      ) : entries.length === 0 ? (
        <div className="card p-12 text-center text-surface-500">
          <FileText size={40} className="mx-auto mb-3 opacity-50" />
          <p>No activity yet. Job creation and candidate contact views will appear here.</p>
        </div>
      ) : (
        <div className="admin-table-wrap">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-100 border-b border-surface-300">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-surface-500">Time</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-surface-500">Actor</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-surface-500">Action</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-surface-500">Resource</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-surface-500">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-200">
                {entries.map((log) => (
                  <tr key={log.id} className="hover:bg-surface-50">
                    <td className="px-4 py-3 text-surface-500 whitespace-nowrap">{formatRelative(log.created_at)}</td>
                    <td className="px-4 py-3 text-surface-600">
                      {log.actor_name ?? (log.user_id ? `${String(log.user_id).slice(0, 8)}…` : '—')}
                    </td>
                    <td className="px-4 py-3 text-surface-700">{log.action}</td>
                    <td className="px-4 py-3 text-surface-600">
                      {log.resource_type ?? '—'}
                      {log.resource_id ? ` · ${String(log.resource_id).slice(0, 8)}…` : ''}
                    </td>
                    <td className="px-4 py-3 text-surface-500 text-xs max-w-[200px] truncate" title={JSON.stringify(log.metadata)}>
                      {log.metadata && Object.keys(log.metadata).length ? JSON.stringify(log.metadata) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
