'use client';

import { useState, useEffect } from 'react';
import { Activity } from 'lucide-react';
import type { ActivityTimelineItem } from '@/types/recruiter-dashboard';

function formatDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffM = Math.floor(diffMs / 60000);
  if (diffM < 1) return 'Just now';
  if (diffM < 60) return `${diffM}m ago`;
  const diffH = Math.floor(diffM / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d ago`;
  return d.toLocaleDateString();
}

function isActivityTimelineItem(value: unknown): value is ActivityTimelineItem {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<ActivityTimelineItem>;
  return (
    typeof v.id === 'string' &&
    typeof v.action === 'string' &&
    typeof v.created_at === 'string'
  );
}

export function ActivityTimeline() {
  const [activity, setActivity] = useState<ActivityTimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [mineOnly, setMineOnly] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/recruiter/dashboard/activity?mine=${mineOnly}&limit=15`)
      .then(async (r) => {
        if (!r.ok) return [] as ActivityTimelineItem[];
        const data = await r.json();
        const list = Array.isArray(data?.activity) ? data.activity.filter(isActivityTimelineItem) : [];
        return list as ActivityTimelineItem[];
      })
      .then((safeActivity) => setActivity(safeActivity))
      .catch(() => setActivity([]))
      .finally(() => setLoading(false));
  }, [mineOnly]);

  return (
    <div className="bg-surface-100 border border-surface-700/60 rounded-xl overflow-hidden">
      <div className="p-4 border-b border-surface-700/60 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <Activity className="w-5 h-5 text-brand-400" />
          Activity
        </h3>
        <label className="flex items-center gap-2 cursor-pointer text-sm text-surface-400">
          <input
            type="checkbox"
            checked={mineOnly}
            onChange={(e) => setMineOnly(e.target.checked)}
            className="rounded border-surface-500 bg-surface-200 text-brand-500"
          />
          My activity only
        </label>
      </div>
      <div className="max-h-64 overflow-y-auto">
        {loading ? (
          <div className="p-6 flex justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-400 border-t-transparent" />
          </div>
        ) : activity.length === 0 ? (
          <div className="p-6 text-center text-surface-500 text-sm">
            No recent activity.
          </div>
        ) : (
          <ul className="divide-y divide-surface-700/50">
            {activity.map((item) => (
              <li key={item.id} className="p-3 pl-4 flex gap-3">
                <div className="shrink-0 w-8 h-8 rounded-full bg-surface-600 flex items-center justify-center">
                  <Activity className="w-4 h-4 text-surface-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white">
                    <span className="font-medium">{item.action.replace(/_/g, ' ')}</span>
                    {item.user_name && (
                      <span className="text-surface-500"> · {item.user_name}</span>
                    )}
                  </p>
                  <p className="text-xs text-surface-500 mt-0.5">
                    {formatDate(item.created_at)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
