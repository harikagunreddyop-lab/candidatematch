'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { Spinner } from '@/components/ui';
import { Mail, RefreshCw, Trash2, Link2 } from 'lucide-react';
import { formatRelative } from '@/utils/helpers';

export default function RecruiterIntegrationsPage() {
  const supabase = createClient();
  const [status, setStatus] = useState<{ connected: boolean; email?: string; connected_at?: string; last_sync_at?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const urlError = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('error') : null;

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/integrations/gmail/status');
        const data = await res.json();
        setStatus(data);
      } catch (e: any) {
        setError(e.message || 'Failed to load status');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const connectGmail = () => {
    window.location.href = '/api/integrations/gmail/auth';
  };

  const syncGmail = async () => {
    if (!status?.connected) return;
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch('/api/integrations/gmail/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxResults: 50 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sync failed');
      setStatus(prev => prev ? { ...prev, last_sync_at: new Date().toISOString() } : prev);
    } catch (e: any) {
      setError(e.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const disconnectGmail = async () => {
    if (!confirm('Disconnect Gmail? You can reconnect anytime.')) return;
    setDisconnecting(true);
    setError(null);
    try {
      const res = await fetch('/api/integrations/gmail/disconnect', { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Disconnect failed');
      setStatus({ connected: false });
    } catch (e: any) {
      setError(e.message || 'Disconnect failed');
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size={28} />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-100 font-display">Integrations</h1>
        <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">
          Connect Gmail to automatically track emails with candidates — no manual tracking needed
        </p>
      </div>

      {urlError === 'gmail' && (
        <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-200">
          Gmail connection was cancelled or failed. Please try again.
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-200">
          {error}
        </div>
      )}

      {/* Gmail */}
      <div className="card p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
            <Mail size={24} className="text-red-600 dark:text-red-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-surface-900 dark:text-surface-100">Gmail</h3>
            <p className="text-sm text-surface-500 dark:text-surface-400 mt-0.5">
              Sync inbox emails and match them to your assigned candidates. Emails from candidate addresses are linked automatically.
            </p>
            {status?.connected ? (
              <div className="mt-4 space-y-3">
                <p className="text-sm text-surface-600 dark:text-surface-300">
                  Connected as <strong>{status.email}</strong>
                  {status.connected_at && (
                    <span className="text-surface-400 dark:text-surface-500 ml-1">
                      · {formatRelative(status.connected_at)}
                    </span>
                  )}
                </p>
                {status.last_sync_at && (
                  <p className="text-xs text-surface-500 dark:text-surface-400">
                    Last sync: {formatRelative(status.last_sync_at)}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={syncGmail}
                    disabled={syncing}
                    className="btn-secondary text-sm py-2 px-4 flex items-center gap-2"
                  >
                    {syncing ? <Spinner size={14} /> : <RefreshCw size={14} />}
                    Sync now
                  </button>
                  <button
                    onClick={disconnectGmail}
                    disabled={disconnecting}
                    className="btn-ghost text-sm py-2 px-4 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 flex items-center gap-2"
                  >
                    {disconnecting ? <Spinner size={14} /> : <Trash2 size={14} />}
                    Disconnect
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={connectGmail}
                className="mt-4 btn-primary text-sm py-2 px-4 flex items-center gap-2"
              >
                <Link2 size={14} /> Connect Gmail
              </button>
            )}
          </div>
        </div>
      </div>

      <p className="text-xs text-surface-500 dark:text-surface-400">
        Requires Google OAuth (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET). Add your redirect URI:{' '}
        <code className="bg-surface-100 dark:bg-surface-700 px-1 rounded">
          {typeof window !== 'undefined' ? window.location.origin : ''}/api/integrations/gmail/callback
        </code>
      </p>
    </div>
  );
}
