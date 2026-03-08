'use client';

import { useState } from 'react';
import { Bell, Plus } from 'lucide-react';

function AlertCard({
  title,
  criteria,
  frequency,
  onEdit,
  onDelete,
}: {
  title: string;
  criteria: string;
  frequency: string;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="rounded-xl border border-surface-700 bg-surface-800/80 p-4 flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <h3 className="font-semibold text-white mb-1">{title}</h3>
        <p className="text-sm text-surface-400 mb-2">{criteria}</p>
        <span className="inline-flex items-center gap-1.5 text-xs text-surface-500">
          <Bell className="w-3.5 h-3.5" />
          {frequency}
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="text-sm text-violet-400 hover:text-violet-300"
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
      </div>
    </div>
  );
}

export default function JobAlertsPage() {
  const [alerts, setAlerts] = useState<
    { id: string; title: string; criteria: string; frequency: string }[]
  >([
    {
      id: '1',
      title: 'Senior Software Engineer',
      criteria: 'Remote • $120k–$180k • React, Node.js',
      frequency: 'Daily',
    },
  ]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-white">Job Alerts</h1>
        <button
          type="button"
          className="btn-primary flex items-center gap-2"
          onClick={() => {}}
        >
          <Plus className="w-4 h-4" />
          Create Alert
        </button>
      </div>

      <p className="text-surface-400 mb-8">
        Get notified when jobs matching your criteria are posted
      </p>

      <div className="space-y-4">
        {alerts.length === 0 ? (
          <div className="rounded-xl border border-surface-700 bg-surface-800/60 py-12 text-center text-surface-500">
            No alerts yet. Create one to get notified about matching jobs.
          </div>
        ) : (
          alerts.map((a) => (
            <AlertCard
              key={a.id}
              title={a.title}
              criteria={a.criteria}
              frequency={a.frequency}
              onEdit={() => {}}
              onDelete={() => setAlerts((prev) => prev.filter((x) => x.id !== a.id))}
            />
          ))
        )}
      </div>
    </div>
  );
}
