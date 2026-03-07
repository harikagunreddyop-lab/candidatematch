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
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/admin" className="text-surface-400 hover:text-white flex items-center gap-1 text-sm">
          <ChevronLeft size={18} /> Back
        </Link>
      </div>
      <h1 className="text-2xl font-bold text-white">Connectors & Ingestion</h1>
      <p className="text-surface-400 text-sm">Job ingestion runs. Connector config is server-side.</p>

      {loading ? (
        <div className="rounded-2xl border border-surface-700 bg-surface-800/50 p-8 text-center text-surface-500">Loading…</div>
      ) : (
        <div className="rounded-2xl border border-surface-700 bg-surface-800/50 overflow-hidden">
          <div className="px-6 py-4 border-b border-surface-700 font-semibold text-white">Recent runs</div>
          <div className="divide-y divide-surface-700">
            {runs.length === 0 ? (
              <div className="p-8 text-center text-surface-500">No cron runs yet.</div>
            ) : (
              runs.map((r: any) => (
                <div key={r.id} className="px-6 py-4 flex items-center justify-between gap-4">
                  <div>
                    <span className="font-medium text-white">{r.mode || 'ingest'}</span>
                    <span className="text-surface-500 text-sm ml-2">{new Date(r.started_at).toLocaleString()}</span>
                  </div>
                  <span className={r.status === 'ok' ? 'text-emerald-400' : r.status === 'failed' ? 'text-red-400' : 'text-amber-400'}>{r.status}</span>
                  {r.error_message && <span className="text-red-400 text-xs truncate max-w-[200px]" title={r.error_message}>{r.error_message}</span>}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
