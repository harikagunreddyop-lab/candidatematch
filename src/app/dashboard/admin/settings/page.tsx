'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { Spinner } from '@/components/ui';
import { Settings, Save, AlertCircle } from 'lucide-react';
import MatchingPanel from '@/components/MatchingPanel';

const FEATURE_DEFAULTS: Record<string, { label: string; key: string; type: 'boolean'; default: boolean }> = {
  feature_candidate_saved_jobs: { label: 'Candidate saved jobs (bookmarks)', key: 'feature_candidate_saved_jobs', type: 'boolean', default: true },
  feature_candidate_reminders: { label: 'Candidate follow-up reminders', key: 'feature_candidate_reminders', type: 'boolean', default: true },
  feature_candidate_export: { label: 'Candidate export my data', key: 'feature_candidate_export', type: 'boolean', default: true },
};

export default function AdminSettingsPage() {
  const supabase = createClient();
  const defaultsMap = Object.fromEntries(Object.entries(FEATURE_DEFAULTS).map(([k, v]) => [k, v.default]));
  const [settings, setSettings] = useState<Record<string, unknown>>(defaultsMap);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('app_settings').select('key, value').in('key', Object.keys(FEATURE_DEFAULTS));
      const map: Record<string, unknown> = { ...defaultsMap };
      for (const d of data || []) {
        map[d.key] = (d.value as any)?.value ?? (FEATURE_DEFAULTS[d.key as keyof typeof FEATURE_DEFAULTS]?.default);
      }
      setSettings(map);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getValue = (key: string) => {
    if (settings[key] !== undefined) return settings[key];
    return FEATURE_DEFAULTS[key]?.default ?? false;
  };

  const setValue = (key: string, value: boolean | string) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      for (const [key, val] of Object.entries(settings)) {
        if (!FEATURE_DEFAULTS[key]) continue;
        await supabase.from('app_settings').upsert({
          key,
          value: { value: val },
          updated_at: new Date().toISOString(),
        }, { onConflict: 'key' });
      }
      setMessage('Settings saved.');
    } catch (e: any) {
      setError(e.message || 'Failed to save');
    }
    setSaving(false);
  };

  if (loading) return <div className="flex justify-center py-20"><Spinner size={28} /></div>;

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-100 font-display">Settings</h1>
        <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">Feature flags, defaults, and matching engine controls</p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-200 flex items-center gap-2">
          <AlertCircle size={16} /> {error}
        </div>
      )}
      {message && (
        <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-900/20 px-4 py-3 text-sm text-green-700 dark:text-green-200">
          {message}
        </div>
      )}

      {/* Feature flags */}
      <div className="card p-4 sm:p-6 space-y-5">
        <h3 className="text-sm font-semibold text-surface-800 dark:text-surface-200 flex items-center gap-2">
          <Settings size={16} /> Feature flags
        </h3>
        <p className="text-xs text-surface-500 dark:text-surface-400">These control which candidate features are available.</p>
        <div className="space-y-4">
          {Object.entries(FEATURE_DEFAULTS).map(([key, def]) => (
            <label key={key} className="flex items-center justify-between gap-4 cursor-pointer">
              <span className="text-sm text-surface-700 dark:text-surface-200">{def.label}</span>
              <input
                type="checkbox"
                checked={!!getValue(key)}
                onChange={e => setValue(key, e.target.checked)}
                className="rounded border-surface-300 text-brand-600"
              />
            </label>
          ))}
        </div>
        <button onClick={save} disabled={saving} className="btn-primary text-sm py-2 px-4 flex items-center gap-2">
          {saving ? <Spinner size={14} /> : <Save size={14} />} Save
        </button>
      </div>

      {/* Stale application auto-cleanup */}
      <StaleCleanupSettings />

      {/* Matching engine controls */}
      <div className="card p-4 sm:p-6">
        <MatchingPanel />
      </div>
    </div>
  );
}

// ─── Stale Application Cleanup ───────────────────────────────────────────────

function StaleCleanupSettings() {
  const supabase = createClient();
  const [days, setDays] = useState(21);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'stale_application_days')
        .maybeSingle();
      if (data) setDays(Number((data.value as any)?.value) || 21);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    await supabase.from('app_settings').upsert(
      { key: 'stale_application_days', value: { value: days }, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    );
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  if (loading) return null;

  return (
    <div className="card p-4 sm:p-6 space-y-5">
      {/* Header */}
      <div>
        <h3 className="text-sm font-semibold text-surface-800 dark:text-surface-200 flex items-center gap-2">
          <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          Auto-cleanup stale applications
        </h3>
        <p className="text-xs text-surface-500 dark:text-surface-400 mt-1">
          Runs automatically every day at 3 AM UTC. No action required — just set the threshold below.
        </p>
      </div>

      {/* Always-on badge */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-500/30 w-fit">
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Active — runs daily at 3 AM UTC</span>
      </div>

      <div className="space-y-4">
        {/* Days threshold */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-surface-700 dark:text-surface-200">Stale threshold</p>
            <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">
              Delete applications with no status change for this many days (min 7, max 180)
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <input
              type="number"
              min={7}
              max={180}
              value={days}
              onChange={e => setDays(Math.max(7, Math.min(180, Number(e.target.value))))}
              className="input w-20 text-sm text-center dark:bg-surface-700 dark:border-surface-600 dark:text-surface-100"
            />
            <span className="text-sm text-surface-500 dark:text-surface-400">days</span>
          </div>
        </div>

        {/* Info box */}
        <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-500/30 px-4 py-3 text-xs text-amber-800 dark:text-amber-200 space-y-1.5">
          <p className="font-semibold flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            What gets deleted?
          </p>
          <p>
            Applications at <strong>applied</strong>, <strong>screening</strong>, or <strong>ready</strong> status
            with no recruiter activity in the last <strong>{days} days</strong>.
            Interview, offer, and rejected records are <strong>never</strong> auto-deleted.
          </p>
          <p className="text-amber-700 dark:text-amber-300 font-medium">
            ⚠ Deletion is permanent. Set the threshold conservatively.
          </p>
        </div>
      </div>

      {/* Save */}
      <div className="pt-1 border-t border-surface-100 dark:border-surface-700">
        <button onClick={save} disabled={saving} className="btn-primary text-sm py-2 px-4 flex items-center gap-2">
          {saving ? <Spinner size={14} /> : <Save size={14} />}
          {saved ? '✓ Saved' : 'Save threshold'}
        </button>
      </div>
    </div>
  );
}
