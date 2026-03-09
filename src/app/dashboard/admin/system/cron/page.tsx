'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-browser';
import { ChevronLeft } from 'lucide-react';
import { formatRelative } from '@/utils/helpers';

export default function CronHistoryPage() {
  const [runs, setRuns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('cron_run_history')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(50);
      setRuns(data || []);
      setLoading(false);
    })();
  }, [supabase]);

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/admin" className="text-surface-600 hover:text-surface-900 flex items-center gap-1 text-sm">
          <ChevronLeft size={18} /> Back
        </Link>
      </div>
      <div>
        <h1 className="admin-page-title">Cron Job History</h1>
        <p className="admin-page-subtitle">Ingest, match, and other scheduled runs.</p>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-surface-300 bg-white p-8 text-center text-surface-500">Loading…</div>
      ) : (
        <div className="admin-table-wrap">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-300 text-left text-surface-500">
                  <th className="px-6 py-3 font-medium">Mode</th>
                  <th className="px-6 py-3 font-medium">Started</th>
                  <th className="px-6 py-3 font-medium">Ended</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Processed</th>
                  <th className="px-6 py-3 font-medium">Error</th>
                </tr>
              </thead>
              <tbody>
                {runs.length === 0 ? (
                  <tr><td colSpan={6} className="px-6 py-8 text-center text-surface-500">No runs yet.</td></tr>
                ) : (
                  runs.map((r: any) => (
                    <tr key={r.id} className="border-b border-surface-200 hover:bg-surface-50">
                      <td className="px-6 py-3 text-surface-900">{r.mode || '—'}</td>
                      <td className="px-6 py-3 text-surface-600">{formatRelative(r.started_at)}</td>
                      <td className="px-6 py-3 text-surface-600">{r.ended_at ? formatRelative(r.ended_at) : '—'}</td>
                      <td className="px-6 py-3">
                        <span className={r.status === 'ok' ? 'text-emerald-600' : r.status === 'failed' ? 'text-red-600' : 'text-amber-600'}>{r.status}</span>
                      </td>
                      <td className="px-6 py-3 text-surface-600">{r.candidates_processed ?? r.total_matches_upserted ?? '—'}</td>
                      <td className="px-6 py-3 text-red-600 truncate max-w-[180px]" title={r.error_message || ''}>{r.error_message || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
