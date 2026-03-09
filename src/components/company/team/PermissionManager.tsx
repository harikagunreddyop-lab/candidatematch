'use client';

import { useCallback, useEffect, useState } from 'react';
import { Shield, Loader2 } from 'lucide-react';
import { cn } from '@/utils/helpers';
import { AVAILABLE_PERMISSIONS, type Permission, type PermissionCategory } from '@/types/team';

export interface PermissionManagerProps {
  userId: string;
  userName?: string | null;
  className?: string;
}

const CATEGORY_LABELS: Record<PermissionCategory, string> = {
  jobs: 'Jobs',
  candidates: 'Candidates',
  analytics: 'Analytics',
  settings: 'Settings',
  billing: 'Billing',
};

export function PermissionManager({ userId, userName, className }: PermissionManagerProps) {
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const fetchPermissions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/company/team/${userId}/permissions`);
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setPermissions(data.permissions ?? {});
    } catch {
      setPermissions({});
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  const handleToggle = async (permissionKey: string, granted: boolean) => {
    setSaving(permissionKey);
    try {
      const res = await fetch(`/api/company/team/${userId}/permissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissionKey, granted }),
      });
      if (!res.ok) throw new Error('Failed to update');
      setPermissions((prev) => ({ ...prev, [permissionKey]: granted }));
    } catch {
      // Revert on error
      setPermissions((prev) => ({ ...prev, [permissionKey]: !granted }));
    } finally {
      setSaving(null);
    }
  };

  const grouped = AVAILABLE_PERMISSIONS.reduce((acc, p) => {
    if (!acc[p.category]) acc[p.category] = [];
    acc[p.category].push(p);
    return acc;
  }, {} as Record<PermissionCategory, Permission[]>);

  if (loading) {
    return (
      <div className={cn('flex items-center justify-center py-8', className)}>
        <Loader2 size={24} className="animate-spin text-surface-400" />
      </div>
    );
  }

  return (
    <div className={cn('space-y-6', className)}>
      <div className="flex items-center gap-2">
        <Shield size={20} className="text-surface-500" />
        <h3 className="font-semibold text-surface-800 dark:text-surface-200">
          Permissions {userName && `· ${userName}`}
        </h3>
      </div>
      {Object.entries(grouped).map(([category, perms]) => (
        <div key={category}>
          <h4 className="text-sm font-medium text-surface-600 dark:text-surface-400 mb-2 capitalize">
            {CATEGORY_LABELS[category as PermissionCategory]}
          </h4>
          <ul className="space-y-2">
            {perms.map((p) => (
              <li
                key={p.key}
                className="flex items-center justify-between gap-4 rounded-lg border border-surface-200 dark:border-surface-600 bg-surface-50 dark:bg-surface-800/50 px-3 py-2"
              >
                <div>
                  <span className="text-sm font-medium text-surface-800 dark:text-surface-200">
                    {p.label}
                  </span>
                  <p className="text-xs text-surface-500 dark:text-surface-400">{p.description}</p>
                </div>
                <label className="flex items-center gap-2 shrink-0">
                  {saving === p.key && <Loader2 size={14} className="animate-spin" />}
                  <input
                    type="checkbox"
                    checked={permissions[p.key] ?? false}
                    onChange={(e) => handleToggle(p.key, e.target.checked)}
                    disabled={!!saving}
                    className="rounded border-surface-300 dark:border-surface-600 text-brand-500 focus:ring-brand-500"
                  />
                </label>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
