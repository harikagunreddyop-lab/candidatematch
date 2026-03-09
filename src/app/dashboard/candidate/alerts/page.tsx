'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bell, Plus, Loader2, Mail, Inbox } from 'lucide-react';

function AlertCard({
  id,
  title,
  criteria,
  frequency,
  active,
  isEditing,
  editName,
  editFrequency,
  onEditNameChange,
  onEditFrequencyChange,
  onSaveEdit,
  onCancelEdit,
  onEdit,
  onDelete,
}: {
  id: string;
  title: string;
  criteria: string;
  frequency: string;
  active: boolean;
  isEditing?: boolean;
  editName?: string;
  editFrequency?: string;
  onEditNameChange?: (value: string) => void;
  onEditFrequencyChange?: (value: string) => void;
  onSaveEdit?: () => void;
  onCancelEdit?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const badge = active ? 'Active' : 'Paused';
  return (
    <div className="rounded-xl border border-surface-700 bg-surface-800/80 p-4 flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        {isEditing ? (
          <input
            value={editName ?? title}
            onChange={(e) => onEditNameChange?.(e.target.value)}
            className="input text-sm mb-2"
            aria-label={`Edit name ${id}`}
          />
        ) : (
          <h3 className="font-semibold text-white mb-1">{title}</h3>
        )}
        <p className="text-sm text-surface-400 mb-2">{criteria}</p>
        {isEditing ? (
          <select
            value={editFrequency ?? frequency}
            onChange={(e) => onEditFrequencyChange?.(e.target.value)}
            className="input text-xs w-40"
            aria-label="Edit alert frequency"
          >
            <option value="instant">Instant</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        ) : (
          <div className="flex items-center gap-3 text-xs text-surface-500">
            <span className="inline-flex items-center gap-1.5">
              <Bell className="w-3.5 h-3.5" />
              {frequency}
            </span>
            <span className="px-1.5 py-0.5 rounded bg-surface-700 text-surface-300">{badge}</span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {isEditing ? (
          <>
            <button type="button" onClick={onSaveEdit} className="text-sm text-brand-400 hover:text-brand-300">Save</button>
            <button type="button" onClick={onCancelEdit} className="text-sm text-surface-500 hover:text-surface-300">Cancel</button>
          </>
        ) : (
          <>
            {onEdit && (
              <button
                type="button"
                onClick={onEdit}
                className="text-sm text-brand-400 hover:text-brand-300"
              >
                Edit
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={onDelete}
                className="text-sm text-surface-500 hover:text-red-400"
              >
                Remove
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

type SavedSearch = {
  id: string;
  search_name: string;
  search_params: Record<string, unknown>;
  alert_frequency?: string | null;
  is_active?: boolean;
};

type AlertEvent = {
  id: string;
  read_at: string | null;
  created_at: string;
  payload?: { search_name?: string; title?: string; company?: string; location?: string; url?: string };
  job?: { id?: string; title?: string; company?: string; location?: string; url?: string };
  saved_search?: { id?: string; search_name?: string };
};

export default function JobAlertsPage() {
  const [alerts, setAlerts] = useState<SavedSearch[]>([]);
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [newName, setNewName] = useState('');
  const [newFrequency, setNewFrequency] = useState<'instant' | 'daily' | 'weekly'>('instant');
  const [newQuery, setNewQuery] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingFrequency, setEditingFrequency] = useState<'instant' | 'daily' | 'weekly'>('daily');

  const load = async () => {
    setLoading(true);
    const [savedRes, alertsRes] = await Promise.all([
      fetch('/api/candidate/saved-searches', { credentials: 'include' }),
      fetch('/api/candidate/alerts?limit=20', { credentials: 'include' }),
    ]);
    const savedData = await savedRes.json().catch(() => ({}));
    const alertsData = await alertsRes.json().catch(() => ({}));
    setAlerts(savedData.saved_searches ?? []);
    setEvents(alertsData.alerts ?? []);
    setUnreadCount(alertsData.unread_count ?? 0);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const formatCriteria = (params: Record<string, unknown>) => {
    const chips: string[] = [];
    if (typeof params.query === 'string' && params.query.trim()) chips.push(params.query.trim());
    if (typeof params.location === 'string' && params.location.trim()) chips.push(params.location.trim());
    if (typeof params.remote_type === 'string' && params.remote_type.trim()) chips.push(params.remote_type.trim());
    if (typeof params.salary_min === 'number' || typeof params.salary_max === 'number') {
      const min = typeof params.salary_min === 'number' ? `$${Math.round(params.salary_min / 1000)}k` : '';
      const max = typeof params.salary_max === 'number' ? `$${Math.round(params.salary_max / 1000)}k` : '';
      chips.push([min, max].filter(Boolean).join('–'));
    }
    const skills = Array.isArray(params.skills) ? params.skills.filter((s) => typeof s === 'string') : [];
    if (skills.length > 0) chips.push(skills.slice(0, 3).join(', '));
    return chips.length > 0 ? chips.join(' • ') : 'No filters';
  };

  const normalized = useMemo(
    () => alerts.map((a) => ({
      ...a,
      frequencyLabel: a.alert_frequency ? a.alert_frequency[0].toUpperCase() + a.alert_frequency.slice(1) : 'Daily',
      criteria: formatCriteria(a.search_params || {}),
    })),
    [alerts]
  );

  const createAlert = async () => {
    if (!newName.trim()) return;
    setSubmitting(true);
    await fetch('/api/candidate/saved-searches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        search_name: newName.trim(),
        search_params: { query: newQuery || undefined, location: newLocation || undefined },
        alert_frequency: newFrequency,
      }),
    });
    setSubmitting(false);
    setNewName('');
    setNewQuery('');
    setNewLocation('');
    await load();
  };

  const deleteAlert = async (id: string) => {
    await fetch(`/api/candidate/saved-searches/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    await load();
  };

  const beginEdit = (item: SavedSearch) => {
    setEditingId(item.id);
    setEditingName(item.search_name);
    setEditingFrequency((item.alert_frequency as 'instant' | 'daily' | 'weekly') || 'daily');
  };

  const saveEdit = async () => {
    if (!editingId) return;
    await fetch(`/api/candidate/saved-searches/${editingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        search_name: editingName.trim(),
        alert_frequency: editingFrequency,
      }),
    });
    setEditingId(null);
    await load();
  };

  const markRead = async (id: string) => {
    await fetch(`/api/candidate/alerts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ read: true }),
    });
    setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, read_at: new Date().toISOString() } : e)));
    setUnreadCount((n) => Math.max(0, n - 1));
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-white">Job Alerts</h1>
        <span className="text-xs text-surface-400 inline-flex items-center gap-1"><Bell className="w-3.5 h-3.5" /> {unreadCount} unread</span>
      </div>

      <p className="text-surface-400 mb-8">
        Get notified when jobs matching your criteria are posted
      </p>

      <div className="rounded-xl border border-surface-700 bg-surface-800/80 p-4 mb-6 space-y-3">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <Plus className="w-4 h-4" /> Create alert
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Alert name (required)"
            className="input text-sm"
          />
          <select
            value={newFrequency}
            onChange={(e) => setNewFrequency(e.target.value as 'instant' | 'daily' | 'weekly')}
            className="input text-sm"
            aria-label="New alert frequency"
          >
            <option value="instant">Instant</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
          <input
            value={newQuery}
            onChange={(e) => setNewQuery(e.target.value)}
            placeholder="Keyword (optional)"
            className="input text-sm"
          />
          <input
            value={newLocation}
            onChange={(e) => setNewLocation(e.target.value)}
            placeholder="Location (optional)"
            className="input text-sm"
          />
        </div>
        <button type="button" className="btn-primary text-sm inline-flex items-center gap-2" onClick={createAlert} disabled={submitting || !newName.trim()}>
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Create Alert
        </button>
      </div>

      <h2 className="text-base font-semibold text-white mb-3">Saved alerts</h2>
      <div className="space-y-4">
        {loading ? (
          <div className="rounded-xl border border-surface-700 bg-surface-800/60 py-8 text-center text-surface-500">
            Loading alerts...
          </div>
        ) : normalized.length === 0 ? (
          <div className="rounded-xl border border-surface-700 bg-surface-800/60 py-12 text-center text-surface-500">
            No alerts yet. Create one to get notified about matching jobs.
          </div>
        ) : (
          normalized.map((a) => (
            <AlertCard
              key={a.id}
              id={a.id}
              title={a.search_name}
              criteria={a.criteria}
              frequency={a.frequencyLabel}
              active={a.is_active ?? true}
              isEditing={editingId === a.id}
              editName={editingName}
              editFrequency={editingFrequency}
              onEditNameChange={setEditingName}
              onEditFrequencyChange={(v) => setEditingFrequency(v as 'instant' | 'daily' | 'weekly')}
              onSaveEdit={saveEdit}
              onCancelEdit={() => setEditingId(null)}
              onEdit={() => beginEdit(a)}
              onDelete={() => deleteAlert(a.id)}
            />
          ))
        )}
      </div>

      <h2 className="text-base font-semibold text-white mt-10 mb-3">Recent in-app alerts</h2>
      <div className="space-y-3">
        {events.length === 0 ? (
          <div className="rounded-xl border border-surface-700 bg-surface-800/60 py-10 text-center text-surface-500">
            No recent alert events yet.
          </div>
        ) : (
          events.map((ev) => {
            const title = ev.job?.title || ev.payload?.title || 'New matching job';
            const company = ev.job?.company || ev.payload?.company || 'Unknown company';
            const location = ev.job?.location || ev.payload?.location || '';
            const href = ev.job?.url || ev.payload?.url || '/dashboard/candidate/jobs';
            return (
              <div key={ev.id} className="rounded-xl border border-surface-700 bg-surface-800/80 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white">{title}</p>
                    <p className="text-xs text-surface-400 mt-0.5">{company}{location ? ` • ${location}` : ''}</p>
                    <p className="text-[11px] text-surface-500 mt-1">{ev.saved_search?.search_name || ev.payload?.search_name || 'Saved search alert'}</p>
                    <a href={href} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-400 hover:text-brand-300 inline-flex items-center gap-1 mt-2">
                      <Mail className="w-3.5 h-3.5" /> Open job
                    </a>
                  </div>
                  {ev.read_at ? (
                    <span className="text-[11px] text-surface-500">Read</span>
                  ) : (
                    <button onClick={() => markRead(ev.id)} className="text-[11px] text-brand-400 hover:text-brand-300 inline-flex items-center gap-1">
                      <Inbox className="w-3.5 h-3.5" /> Mark read
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
