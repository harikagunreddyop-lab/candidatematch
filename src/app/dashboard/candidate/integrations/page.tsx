'use client';

import { useState, useEffect } from 'react';
import { Spinner } from '@/components/ui';
import { Mail, RefreshCw, Trash2, Link2, Briefcase } from 'lucide-react';
import { formatRelative } from '@/utils/helpers';

type TrackingStats = {
  emailsScanned: number;
  jobsDetected: number;
  autoUpdates: number;
  detections: Array<{ company: string; jobTitle: string; status: string; subject: string }>;
};

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xs font-medium text-surface-400 uppercase tracking-wide">{label}</p>
      <p className="text-xl font-bold text-white mt-1 tabular-nums">{value ?? 0}</p>
    </div>
  );
}

export default function CandidateIntegrationsPage() {
  const [connected, setConnected] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [connectedAt, setConnectedAt] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [trackingStats, setTrackingStats] = useState<TrackingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const urlError = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('error') : null;

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/integrations/gmail/status');
        const data = await res.json();
        setConnected(!!data.connected);
        setEmail(data.email ?? null);
        setConnectedAt(data.connected_at ?? null);
        setLastSyncAt(data.last_sync_at ?? null);
      } catch {
        setConnected(false);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const connectGmail = () => {
    if (connecting) return;
    setConnecting(true);
    window.location.href = '/api/integrations/gmail/auth?for=candidate';
  };

  const syncGmail = async () => {
    if (!connected) return;
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch('/api/integrations/gmail/candidate-sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sync failed');
      setLastSyncAt(new Date().toISOString());
      setTrackingStats({
        emailsScanned: data.emailsScanned ?? 0,
        jobsDetected: data.jobsDetected ?? 0,
        autoUpdates: data.autoUpdates ?? 0,
        detections: data.detections ?? [],
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Sync failed');
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
      setConnected(false);
      setEmail(null);
      setConnectedAt(null);
      setLastSyncAt(null);
      setTrackingStats(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Disconnect failed');
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
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-3xl font-bold text-white">Email Tracking</h1>
      <p className="text-surface-400 text-sm">
        Connect Gmail to automatically detect job application emails and update your application status.
      </p>

      {urlError === 'gmail' && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          Gmail connection was cancelled or failed. Please try again.
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {!connected ? (
        <div className="bg-surface-800 rounded-xl border border-surface-700 p-8 text-center">
          <h2 className="text-xl font-semibold text-white mb-4">
            Connect Gmail to Auto-Track Applications
          </h2>
          <p className="text-surface-400 mb-6 max-w-md mx-auto">
            We&apos;ll automatically detect job application emails (confirmations, interview invites, offers)
            and update your application status in your dashboard.
          </p>
          <button
            onClick={connectGmail}
            disabled={connecting}
            className="px-6 py-3 bg-violet-600 hover:bg-violet-700 disabled:opacity-70 text-white rounded-lg font-semibold inline-flex items-center gap-2"
          >
            {connecting ? <Spinner size={18} /> : <Link2 size={18} />}
            Connect Gmail
          </button>
        </div>
      ) : (
        <div className="bg-surface-800 rounded-xl border border-surface-700 p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center">
                <Mail size={20} className="text-red-400" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-white">Gmail Connected</h2>
                <p className="text-sm text-surface-400">
                  {email}
                  {connectedAt && ` · Connected ${formatRelative(connectedAt)}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
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
                className="text-sm text-red-400 hover:text-red-300 py-2 px-3"
              >
                {disconnecting ? <Spinner size={14} /> : 'Disconnect'}
              </button>
            </div>
          </div>

          {lastSyncAt && (
            <p className="text-xs text-surface-500 mb-4">Last sync: {formatRelative(lastSyncAt)}</p>
          )}

          <div className="grid grid-cols-3 gap-4 mb-6">
            <Metric label="Emails Scanned" value={trackingStats?.emailsScanned ?? 0} />
            <Metric label="Jobs Detected" value={trackingStats?.jobsDetected ?? 0} />
            <Metric label="Auto-Updates" value={trackingStats?.autoUpdates ?? 0} />
          </div>

          {trackingStats?.detections && trackingStats.detections.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-white mb-3">Recent Detections</h3>
              <ul className="space-y-2">
                {trackingStats.detections.map((d, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-3 py-2 px-3 rounded-lg bg-surface-700/50 border border-surface-600"
                  >
                    <Briefcase size={16} className="text-surface-400 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-white truncate">
                        {d.jobTitle} at {d.company}
                      </p>
                      <p className="text-xs text-surface-400 truncate">{d.subject}</p>
                    </div>
                    <span className="text-xs font-medium text-emerald-400 capitalize shrink-0">
                      {d.status}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {connected && (!trackingStats || trackingStats.detections?.length === 0) && (
            <p className="text-sm text-surface-500">
              Click &quot;Sync now&quot; to scan your last 7 days of job-related emails and update application statuses.
            </p>
          )}
        </div>
      )}

      <p className="text-xs text-surface-500">
        Redirect URI for Google Cloud Console:{' '}
        <code className="bg-surface-700 px-1.5 py-0.5 rounded text-surface-300">
          {typeof window !== 'undefined' ? `${window.location.origin}/api/integrations/gmail/callback` : '…'}
        </code>
      </p>
    </div>
  );
}
