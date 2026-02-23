'use client';
import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { Spinner } from '@/components/ui';
import { Settings, Bell, Shield, Trash2, AlertTriangle } from 'lucide-react';

function PrivacyDataSection() {
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const [dataProcessing, setDataProcessing] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [deletionStatus, setDeletionStatus] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadConsents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/compliance?type=consent');
      if (res.ok) {
        const { consents } = await res.json();
        const latest: Record<string, boolean> = {};
        for (const c of consents || []) {
          if (!latest[c.consent_type]) latest[c.consent_type] = c.granted;
        }
        setPrivacyConsent(latest['privacy_policy'] ?? false);
        setDataProcessing(latest['data_processing'] ?? false);
        setMarketing(latest['marketing_emails'] ?? false);
      }
      const delRes = await fetch('/api/compliance?type=deletion-requests');
      if (delRes.ok) {
        const { requests } = await delRes.json();
        const pending = (requests || []).find((r: any) => ['pending', 'approved', 'processing'].includes(r.status));
        if (pending) setDeletionStatus(pending.status);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadConsents(); }, [loadConsents]);

  const toggleConsent = async (consentType: string, granted: boolean) => {
    setSaving(consentType);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/compliance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'record_consent', consent_type: consentType, granted }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update');
      }
      if (consentType === 'privacy_policy') setPrivacyConsent(granted);
      if (consentType === 'data_processing') setDataProcessing(granted);
      if (consentType === 'marketing_emails') setMarketing(granted);
      setSuccess('Preference saved');
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: any) {
      setError(e.message);
    }
    setSaving(null);
  };

  const requestDeletion = async () => {
    setDeleteLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/compliance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'request_deletion', reason: deleteReason || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setDeletionStatus('pending');
      setShowDeleteConfirm(false);
      setDeleteReason('');
      setSuccess('Deletion request submitted. An admin will review it.');
      setTimeout(() => setSuccess(null), 5000);
    } catch (e: any) {
      setError(e.message);
    }
    setDeleteLoading(false);
  };

  if (loading) return <div className="flex justify-center py-6"><Spinner size={20} /></div>;

  return (
    <div className="space-y-4">
      {success && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-700 dark:text-emerald-400">
          {success}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-50 dark:bg-red-500/10 px-4 py-2.5 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      <ConsentToggle
        label="Privacy Policy"
        description="I have read and accept the privacy policy"
        checked={privacyConsent}
        loading={saving === 'privacy_policy'}
        onChange={(v) => toggleConsent('privacy_policy', v)}
      />
      <ConsentToggle
        label="Data Processing"
        description="I consent to processing my personal data for recruitment purposes"
        checked={dataProcessing}
        loading={saving === 'data_processing'}
        onChange={(v) => toggleConsent('data_processing', v)}
      />
      <ConsentToggle
        label="Marketing Emails"
        description="I agree to receive job alerts and marketing communications"
        checked={marketing}
        loading={saving === 'marketing_emails'}
        onChange={(v) => toggleConsent('marketing_emails', v)}
      />

      <div className="pt-4 border-t border-surface-200 dark:border-surface-700 space-y-3">
        {deletionStatus ? (
          <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
            <AlertTriangle size={16} />
            You have a {deletionStatus} data deletion request.
          </div>
        ) : showDeleteConfirm ? (
          <div className="space-y-3 p-4 rounded-xl bg-red-50 dark:bg-red-500/5 border border-red-200 dark:border-red-500/20">
            <p className="text-sm font-medium text-red-800 dark:text-red-300">Are you sure? This will permanently remove all your data.</p>
            <textarea
              placeholder="Reason (optional)"
              value={deleteReason}
              onChange={e => setDeleteReason(e.target.value)}
              rows={2}
              className="input text-sm w-full"
            />
            <div className="flex gap-2">
              <button onClick={requestDeletion} disabled={deleteLoading} className="btn-primary text-sm py-2 px-4 bg-red-600 hover:bg-red-700 flex items-center gap-1.5">
                {deleteLoading ? <Spinner size={14} className="inline" /> : <Trash2 size={14} />} Confirm Deletion Request
              </button>
              <button onClick={() => setShowDeleteConfirm(false)} className="btn-outline text-sm py-2 px-4">Cancel</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowDeleteConfirm(true)} className="btn-outline text-sm py-2 px-4 text-red-600 dark:text-red-400 border-red-300 dark:border-red-500/30 hover:bg-red-50 dark:hover:bg-red-500/10 flex items-center gap-1.5">
            <Trash2 size={14} /> Request Data Deletion
          </button>
        )}
      </div>
    </div>
  );
}

function ConsentToggle({ label, description, checked, loading, onChange }: {
  label: string; description: string; checked: boolean; loading: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group">
      <div className="pt-0.5">
        {loading ? (
          <Spinner size={16} />
        ) : (
          <button
            role="switch"
            aria-checked={checked}
            onClick={() => onChange(!checked)}
            className={`relative w-10 h-6 rounded-full transition-colors ${checked ? 'bg-brand-500' : 'bg-surface-300 dark:bg-surface-600'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : ''}`} />
          </button>
        )}
      </div>
      <div>
        <p className="text-sm font-medium text-surface-900 dark:text-surface-100">{label}</p>
        <p className="text-xs text-surface-500 dark:text-surface-400">{description}</p>
      </div>
    </label>
  );
}

function SendPasswordReset() {
  const supabase = createClient();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handleSend = async () => {
    setSending(true);
    setError(null);
    const { data: { session } } = await supabase.auth.getSession();
    const email = session?.user?.email;
    if (!email) {
      setError('No email on file');
      setSending(false);
      return;
    }
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || (typeof window !== 'undefined' ? window.location.origin : '')}/auth/reset-password`,
    });
    if (err) setError(err.message);
    else setSent(true);
    setSending(false);
  };
  return (
    <div className="space-y-2">
      <button onClick={handleSend} disabled={sending || sent} className="btn-primary text-sm py-2 px-4">
        {sending ? <Spinner size={14} className="inline" /> : sent ? 'Check your email' : 'Send password reset email'}
      </button>
      {sent && <p className="text-xs text-emerald-600 dark:text-emerald-400">We sent a link to your email. Use it to set a new password.</p>}
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

export default function CandidateSettingsPage() {
  const [candidate, setCandidate] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notLinked, setNotLinked] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }
      const { data: cand } = await supabase.from('candidates').select('id').eq('user_id', session.user.id).single();
      if (!cand) setNotLinked(true);
      else setCandidate(cand);
      setLoading(false);
    })();
  }, [supabase]);

  if (loading) return <div className="flex justify-center py-20"><Spinner size={28} /></div>;
  if (notLinked) return (
    <div className="flex flex-col items-center justify-center py-24 gap-6 text-center px-4">
      <p className="text-sm text-surface-500 dark:text-surface-300">Your account isn&apos;t linked to a candidate profile yet. Contact your recruiter.</p>
    </div>
  );

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-xl font-bold text-surface-900 dark:text-surface-100 font-display">Account & preferences</h1>

      <div className="rounded-2xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-6 shadow-sm space-y-4">
        <h3 className="text-sm font-bold text-surface-900 dark:text-surface-100 font-display flex items-center gap-2">
          <Settings size={16} className="text-surface-500 dark:text-surface-400" /> Password
        </h3>
        <p className="text-sm text-surface-600 dark:text-surface-300">Send a password reset link to your email. You’ll set a new password from there.</p>
        <SendPasswordReset />
      </div>

      <div className="rounded-2xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-6 shadow-sm space-y-4">
        <h3 className="text-sm font-bold text-surface-900 dark:text-surface-100 font-display flex items-center gap-2">
          <Bell size={16} className="text-surface-500 dark:text-surface-400" /> Notifications
        </h3>
        <p className="text-sm text-surface-600 dark:text-surface-300">Email reminders for your follow-ups (e.g. when a reminder is due) can be enabled by your recruiter. In-app reminders are always available on the Reminders tab.</p>
      </div>

      <div className="rounded-2xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-6 shadow-sm space-y-4">
        <h3 className="text-sm font-bold text-surface-900 dark:text-surface-100 font-display flex items-center gap-2">
          <Shield size={16} className="text-surface-500 dark:text-surface-400" /> Privacy & Data
        </h3>
        <p className="text-sm text-surface-600 dark:text-surface-300">Manage your consent preferences and data rights.</p>
        <PrivacyDataSection />
      </div>
    </div>
  );
}
