'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { Spinner } from '@/components/ui';
import { Settings, Save, AlertCircle } from 'lucide-react';

const DEFAULTS: Record<string, { label: string; key: string; type: 'boolean' | 'text'; default: boolean | string }> = {
  feature_candidate_saved_jobs: { label: 'Candidate saved jobs (bookmarks)', key: 'feature_candidate_saved_jobs', type: 'boolean', default: true },
  feature_candidate_reminders: { label: 'Candidate follow-up reminders', key: 'feature_candidate_reminders', type: 'boolean', default: true },
  feature_candidate_export: { label: 'Candidate export my data', key: 'feature_candidate_export', type: 'boolean', default: true },
};

export default function AdminSettingsPage() {
  const supabase = createClient();
  const defaultsMap = Object.fromEntries(Object.entries(DEFAULTS).map(([k, v]) => [k, v.default]));
  const [settings, setSettings] = useState<Record<string, unknown>>(defaultsMap);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('app_settings').select('key, value').in('key', Object.keys(DEFAULTS));
      const map: Record<string, unknown> = { ...defaultsMap };
      for (const d of data || []) {
        map[d.key] = (d.value as any)?.value ?? (DEFAULTS[d.key as keyof typeof DEFAULTS]?.default);
      }
      setSettings(map);
      setLoading(false);
    })();
  }, []);

  const getValue = (key: string) => {
    if (settings[key] !== undefined) return settings[key];
    return DEFAULTS[key]?.default ?? false;
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
        if (!DEFAULTS[key]) continue;
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
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-surface-900 font-display">Settings</h1>
        <p className="text-sm text-surface-500 mt-1">Feature flags and defaults (elite config)</p>
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

      <div className="card p-6 space-y-5">
        <h3 className="text-sm font-semibold text-surface-800 flex items-center gap-2">
          <Settings size={16} /> Feature flags
        </h3>
        <p className="text-xs text-surface-500">These control which candidate features are available. Changing here does not hide UI yet — use as reference for rollout.</p>
        <div className="space-y-4">
          {Object.entries(DEFAULTS).map(([key, def]) => (
            <label key={key} className="flex items-center justify-between gap-4 cursor-pointer">
              <span className="text-sm text-surface-700 dark:text-surface-200">{def.label}</span>
              {def.type === 'boolean' && (
                <input
                  type="checkbox"
                  checked={!!getValue(key)}
                  onChange={e => setValue(key, e.target.checked)}
                  className="rounded border-surface-300 text-brand-600"
                />
              )}
            </label>
          ))}
        </div>
        <button onClick={save} disabled={saving} className="btn-primary text-sm py-2 px-4 flex items-center gap-2">
          {saving ? <Spinner size={14} /> : <Save size={14} />} Save
        </button>
      </div>
    </div>
  );
}
