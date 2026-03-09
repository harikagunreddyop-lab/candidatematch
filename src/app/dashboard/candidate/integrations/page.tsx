'use client';

import { useState, useEffect } from 'react';
import { Spinner } from '@/components/ui';
import { Mail, RefreshCw, Link2, Briefcase } from 'lucide-react';
import { formatRelative } from '@/utils/helpers';
import { getPublicAppUrl } from '@/lib/public-app-url';
import Link from 'next/link';

type TrackingStats = {
  emailsScanned: number;
  jobsDetected: number;
  autoUpdates: number;
  detections: Array<{ company: string; jobTitle: string; status: string; subject: string }>;
};

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-surface-300 bg-surface-100 p-3">
      <p className="text-xs font-semibold text-surface-500 uppercase tracking-wide">{label}</p>
      <p className="text-xl font-bold text-surface-900 mt-1 tabular-nums">{value ?? 0}</p>
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
    const browserOrigin = typeof window !== 'undefined' ? window.location.origin : null;
    const configuredPublicUrl = getPublicAppUrl();
    // #region agent log
    fetch('http://127.0.0.1:7830/ingest/7e7b9384-2f83-41f7-a326-f10ef9606c50',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'fa3c27'},body:JSON.stringify({sessionId:'fa3c27',runId:'baseline-1',hypothesisId:'H1',location:'integrations/page.tsx:42',message:'Integrations page mounted',data:{browserOrigin,configuredPublicUrl,urlError},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    // #region agent log
    fetch('http://127.0.0.1:7830/ingest/7e7b9384-2f83-41f7-a326-f10ef9606c50',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bacffe'},body:JSON.stringify({sessionId:'bacffe',runId:'candidate-audit-1',hypothesisId:'H2',location:'integrations/page.tsx:42',message:'Candidate Gmail integration URL sources',data:{browserOrigin,configuredPublicUrl,usesWindowOriginForCallback:true},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
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
    // #region agent log
    fetch('http://127.0.0.1:7830/ingest/7e7b9384-2f83-41f7-a326-f10ef9606c50',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bacffe'},body:JSON.stringify({sessionId:'bacffe',runId:'candidate-audit-1',hypothesisId:'H2',location:'integrations/page.tsx:64',message:'Candidate starts Gmail connect',data:{redirectPath:'/api/integrations/gmail/auth?for=candidate'},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
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
      <div className="rounded-2xl border border-surface-300 bg-surface-100 p-4">
        <h1 className="text-2xl font-bold text-surface-900">Email Integration</h1>
        <p className="text-surface-600 text-sm mt-1">
          Connect Gmail once, then track application updates from your email on this same page.
        </p>
        <p className="text-surface-500 text-xs mt-2">Flow: Connect email -&gt; Sync inbox -&gt; Review tracking updates.</p>
      </div>

      {urlError === 'gmail' && (
        <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          Gmail connection was cancelled or failed. Please try again.
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {!connected ? (
        <div className="bg-surface-100 rounded-xl border border-surface-300 p-8 text-center">
          <h2 className="text-xl font-semibold text-surface-900 mb-4">
            Integrate Gmail to Enable Tracking
          </h2>
          <p className="text-surface-600 mb-6 max-w-md mx-auto">
            We&apos;ll detect job application emails (confirmations, interview invites, offers) and keep your
            tracking data updated.
          </p>
          <button
            onClick={connectGmail}
            disabled={connecting}
            className="px-6 py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-70 text-white rounded-lg font-semibold inline-flex items-center gap-2"
          >
            {connecting ? <Spinner size={18} /> : <Link2 size={18} />}
            Connect Gmail
          </button>
        </div>
      ) : (
        <div className="bg-surface-100 rounded-xl border border-surface-300 p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center">
                <Mail size={20} className="text-red-400" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-surface-900">Gmail Connected</h2>
                <p className="text-sm text-surface-600">
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
                className="text-sm text-red-600 hover:text-red-700 py-2 px-3"
              >
                {disconnecting ? <Spinner size={14} /> : 'Disconnect'}
              </button>
            </div>
          </div>

          {lastSyncAt && (
            <p className="text-xs text-surface-500 mb-4">Last sync: {formatRelative(lastSyncAt)}</p>
          )}

          <h3 className="text-sm font-semibold text-surface-700 mb-3">Application Tracking</h3>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <Metric label="Emails Scanned" value={trackingStats?.emailsScanned ?? 0} />
            <Metric label="Jobs Detected" value={trackingStats?.jobsDetected ?? 0} />
            <Metric label="Auto-Updates" value={trackingStats?.autoUpdates ?? 0} />
          </div>

          {trackingStats?.detections && trackingStats.detections.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-surface-900 mb-3">Recent Detections</h3>
              <ul className="space-y-2">
                {trackingStats.detections.map((d, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-3 py-2 px-3 rounded-lg bg-surface-50 border border-surface-300"
                  >
                    <Briefcase size={16} className="text-surface-500 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-surface-900 truncate">
                        {d.jobTitle} at {d.company}
                      </p>
                      <p className="text-xs text-surface-600 truncate">{d.subject}</p>
                    </div>
                    <span className="text-xs font-semibold text-emerald-700 capitalize shrink-0">
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

          {connected && (lastSyncAt || (trackingStats?.detections?.length ?? 0) > 0) && (
            <div className="mt-5 border-t border-surface-300 pt-4">
              <Link href="/dashboard/candidate/applications" className="btn-primary inline-flex items-center">
                Open application tracking
              </Link>
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-surface-500">
        Redirect URI for Google Cloud Console:{' '}
        <code className="bg-surface-100 border border-surface-300 px-1.5 py-0.5 rounded text-surface-700">
          {typeof window !== 'undefined' ? `${window.location.origin}/api/integrations/gmail/callback` : '…'}
        </code>
      </p>
    </div>
  );
}
