'use client';
import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { Spinner } from '@/components/ui';
import { FileText } from 'lucide-react';
import { formatDate, formatRelative } from '@/utils/helpers';

export default function AdminAuditPage() {
  const supabase = createClient();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(100);

  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await supabase
      .from('audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) {
      const msg = error.message || 'Failed to load audit log';
      setLoadError(msg);
      setLogs([]);
      // If table is missing, set a flag so we can show setup instructions
      if (msg.toLowerCase().includes('audit_log') && (msg.includes('schema cache') || msg.includes('does not exist') || msg.includes('relation'))) {
        setLoadError('TABLE_MISSING');
      }
    } else {
      setLogs(data || []);
    }
    setLoading(false);
  }, [limit]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 font-display">Audit log</h1>
          <p className="text-sm text-surface-500 mt-1">Recent actions by admins and recruiters</p>
        </div>
        <select value={limit} onChange={e => setLimit(Number(e.target.value))} className="input text-sm py-2 px-3 w-28">
          <option value={50}>Last 50</option>
          <option value={100}>Last 100</option>
          <option value={250}>Last 250</option>
          <option value={500}>Last 500</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={28} /></div>
      ) : loadError === 'TABLE_MISSING' ? (
        <div className="card p-8 max-w-2xl mx-auto text-left">
          <h2 className="text-lg font-bold text-surface-900 dark:text-surface-100 font-display">Audit log table not found</h2>
          <p className="text-sm text-surface-600 dark:text-surface-400 mt-2">
            The <code className="px-1.5 py-0.5 rounded bg-surface-100 dark:bg-surface-700 text-xs">public.audit_log</code> table has not been created yet. Run the migration to create it.
          </p>
          <div className="mt-4 p-4 rounded-xl bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-600">
            <p className="text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wider mb-2">Option 1 — Supabase CLI</p>
            <p className="text-sm text-surface-700 dark:text-surface-300 mb-2">From the project root:</p>
            <pre className="text-xs font-mono bg-surface-900 dark:bg-surface-950 text-surface-100 p-3 rounded-lg overflow-x-auto">
              npx supabase db push
            </pre>
            <p className="text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wider mt-4 mb-2">Option 2 — SQL Editor</p>
            <p className="text-sm text-surface-700 dark:text-surface-300 mb-2">In Supabase Dashboard → SQL Editor, run:</p>
            <pre className="text-[11px] font-mono bg-surface-900 dark:bg-surface-950 text-surface-100 p-3 rounded-lg overflow-x-auto mt-2 whitespace-pre-wrap">
{`CREATE TABLE IF NOT EXISTS public.audit_log (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_role    TEXT NOT NULL DEFAULT 'admin',
  action        TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id   TEXT,
  details       JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON public.audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON public.audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON public.audit_log(resource_type, resource_id);
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_log_admin_only" ON public.audit_log
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );`}
            </pre>
          </div>
          <button type="button" onClick={() => { setLoadError(null); load(); }} className="btn-primary mt-4">Try again</button>
        </div>
      ) : loadError ? (
        <div className="card p-12 text-center">
          <p className="text-surface-700 dark:text-surface-200 font-medium">Failed to load audit log</p>
          <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">{loadError}</p>
          <button type="button" onClick={() => load()} className="btn-primary mt-4">Try again</button>
        </div>
      ) : logs.length === 0 ? (
        <div className="card p-12 text-center text-surface-500">
          <FileText size={40} className="mx-auto mb-3 opacity-50" />
          <p>No audit entries yet. Actions such as assignment changes, status updates, and matching runs will appear here.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-50 border-b border-surface-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-surface-500">Time</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-surface-500">Actor</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-surface-500">Action</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-surface-500">Resource</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-surface-500">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-50">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-surface-50">
                    <td className="px-4 py-3 text-surface-500 whitespace-nowrap">{formatRelative(log.created_at)}</td>
                    <td className="px-4 py-3">
                      <span className="text-surface-600 font-medium">{log.actor_role}</span>
                      {log.actor_id && <span className="text-surface-400 text-xs ml-1">({String(log.actor_id).slice(0, 8)}…)</span>}
                    </td>
                    <td className="px-4 py-3 text-surface-700">{log.action}</td>
                    <td className="px-4 py-3 text-surface-600">{log.resource_type}{log.resource_id ? ` · ${String(log.resource_id).slice(0, 8)}…` : ''}</td>
                    <td className="px-4 py-3 text-surface-500 text-xs max-w-[200px] truncate" title={JSON.stringify(log.details)}>{Object.keys(log.details || {}).length ? JSON.stringify(log.details) : '—'}</td>
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
