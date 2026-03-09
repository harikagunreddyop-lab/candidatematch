'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { FolderPlus, Users, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/utils/helpers';
import type { TalentPool } from '@/types/pipeline';

export interface TalentPoolManagerProps {
  onSelectPool?: (poolId: string) => void;
  className?: string;
}

export function TalentPoolManager({ onSelectPool, className }: TalentPoolManagerProps) {
  const [pools, setPools] = useState<TalentPool[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState('');
  const [addDescription, setAddDescription] = useState('');

  const fetchPools = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/company/talent-pools');
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setPools(data.pools ?? []);
    } catch {
      setPools([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPools();
  }, [fetchPools]);

  const handleCreate = async () => {
    if (!addName.trim()) return;
    const res = await fetch('/api/company/talent-pools', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pool_name: addName.trim(),
        description: addDescription.trim() || null,
        criteria: {},
      }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error || 'Failed to create pool');
      return;
    }
    setAddName('');
    setAddDescription('');
    setShowAdd(false);
    await fetchPools();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deactivate this talent pool?')) return;
    const res = await fetch(`/api/company/talent-pools/${id}`, { method: 'DELETE' });
    if (!res.ok) return;
    await fetchPools();
  };

  if (loading) {
    return (
      <div className={cn('flex items-center justify-center py-8', className)}>
        <div className="animate-spin w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className={cn('rounded-xl border border-surface-200 dark:border-surface-600 bg-surface-50 dark:bg-surface-800/50 overflow-hidden', className)}>
      <div className="px-4 py-3 border-b border-surface-200 dark:border-surface-600 flex items-center justify-between">
        <h3 className="font-semibold text-surface-800 dark:text-surface-200 flex items-center gap-2">
          <FolderPlus size={18} /> Talent pools
        </h3>
        <button
          type="button"
          onClick={() => setShowAdd(!showAdd)}
          className="text-sm text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1"
        >
          <Plus size={16} /> New pool
        </button>
      </div>
      {showAdd && (
        <div className="p-4 border-b border-surface-200 dark:border-surface-600 space-y-2">
          <input
            type="text"
            placeholder="Pool name"
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            className="w-full rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 px-3 py-2 text-sm"
          />
          <input
            type="text"
            placeholder="Description (optional)"
            value={addDescription}
            onChange={(e) => setAddDescription(e.target.value)}
            className="w-full rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCreate}
              disabled={!addName.trim()}
              className="px-3 py-1.5 rounded-lg bg-brand-500 text-white text-sm font-medium disabled:opacity-50"
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => { setShowAdd(false); setAddName(''); setAddDescription(''); }}
              className="px-3 py-1.5 rounded-lg border border-surface-300 dark:border-surface-600 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      <ul className="divide-y divide-surface-200 dark:divide-surface-600">
        {pools.length === 0 && !showAdd ? (
          <li className="px-4 py-6 text-center text-surface-500 text-sm">
            No talent pools yet. Create one to group candidates.
          </li>
        ) : (
          pools.map((pool) => (
            <li
              key={pool.id}
              className="flex items-center gap-3 px-4 py-3 hover:bg-surface-100 dark:hover:bg-surface-700/50"
            >
              <Users size={18} className="text-surface-400 shrink-0" />
              <button
                type="button"
                onClick={() => onSelectPool?.(pool.id)}
                className="flex-1 text-left min-w-0"
              >
                <span className="font-medium text-surface-800 dark:text-surface-200 block truncate">
                  {pool.pool_name}
                </span>
                <span className="text-xs text-surface-500 dark:text-surface-400">
                  {pool.candidate_count} candidate{pool.candidate_count !== 1 ? 's' : ''}
                </span>
              </button>
              <Link
                href={`/dashboard/company/candidates?pool=${pool.id}`}
                className="text-xs text-brand-600 dark:text-brand-400 hover:underline"
              >
                View
              </Link>
              <button
                type="button"
                onClick={() => handleDelete(pool.id)}
                className="p-1 text-surface-400 hover:text-red-500"
                aria-label="Delete pool"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
