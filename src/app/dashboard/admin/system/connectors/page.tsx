'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-browser';
import { ChevronLeft } from 'lucide-react';

export default function ConnectorsPage() {
  const [runs, setRuns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('cron_run_history')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(20);
      setRuns(data || []);
      setLoading(false);
    })();
  }, [supabase]);

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/admin" className="text-surface-600 hover:text-surface-900 flex items-center gap-1 text-sm">
          <ChevronLeft size={18} /> Back
        </Link>
      </div>
      <div>
        <h1 className="admin-page-title">Connectors & Ingestion</h1>
        <p className="admin-page-subtitle">Job ingestion runs and connector execution history.</p>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-surface-300 bg-white p-8 text-center text-surface-500">Loading…</div>
      ) : (
        <div className="admin-table-wrap">
          <div className="px-6 py-4 border-b border-surface-300 font-semibold text-surface-900">Recent runs</div>
          <div className="divide-y divide-surface-200">
            {runs.length === 0 ? (
              <div className="p-8 text-center text-surface-500">No cron runs yet.</div>
            ) : (
              runs.map((r: any) => (
                <div key={r.id} className="px-6 py-4 flex items-center justify-between gap-4">
                  <div>
                    <span className="font-medium text-surface-900">{r.mode || 'ingest'}</span>
                    <span className="text-surface-500 text-sm ml-2">{new Date(r.started_at).toLocaleString()}</span>
                  </div>
                  <span className={r.status === 'ok' ? 'text-emerald-600' : r.status === 'failed' ? 'text-red-600' : 'text-amber-600'}>{r.status}</span>
                  {r.error_message && <span className="text-red-600 text-xs truncate max-w-[200px]" title={r.error_message}>{r.error_message}</span>}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
