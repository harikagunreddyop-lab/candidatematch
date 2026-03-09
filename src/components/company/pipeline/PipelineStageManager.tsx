'use client';

import { useCallback, useEffect, useState } from 'react';
import { Settings2, Plus, GripVertical } from 'lucide-react';
import { cn } from '@/utils/helpers';
import type { PipelineStage } from '@/types/pipeline';

export interface PipelineStageManagerProps {
  onStagesChange?: (stages: PipelineStage[]) => void;
  className?: string;
}

export function PipelineStageManager({ onStagesChange, className }: PipelineStageManagerProps) {
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const fetchStages = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/company/pipeline/stages');
      if (!res.ok) throw new Error('Failed to load stages');
      const json = await res.json();
      setStages(json.stages ?? []);
      onStagesChange?.(json.stages ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
      setStages([]);
    } finally {
      setLoading(false);
    }
  }, [onStagesChange]);

  useEffect(() => {
    fetchStages();
  }, [fetchStages]);

  const handleCreate = async (stage_name: string, stage_color?: string) => {
    const order = stages.length;
    const res = await fetch('/api/company/pipeline/stages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stage_name,
        stage_order: order,
        stage_color: stage_color || null,
      }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error || 'Failed to create');
    }
    setShowAdd(false);
    await fetchStages();
  };

  const handleUpdate = async (id: string, updates: { stage_name?: string; stage_color?: string; sla_hours?: number }) => {
    const res = await fetch(`/api/company/pipeline/stages/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error || 'Failed to update');
    }
    setEditingId(null);
    await fetchStages();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deactivate this stage? Applications in it will need to be moved.')) return;
    const res = await fetch(`/api/company/pipeline/stages/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error || 'Failed to delete');
    }
    await fetchStages();
  };

  if (loading) {
    return (
      <div className={cn('flex items-center justify-center py-8', className)}>
        <div className="animate-spin w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn('rounded-lg border border-red-200 dark:border-red-800 p-4 text-red-700 dark:text-red-300', className)}>
        {error}
        <button type="button" onClick={() => fetchStages()} className="ml-2 underline">Retry</button>
      </div>
    );
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-surface-700 dark:text-surface-200 flex items-center gap-2">
          <Settings2 size={16} /> Pipeline stages
        </h3>
        {!showAdd && (
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="text-xs text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1"
          >
            <Plus size={14} /> Add stage
          </button>
        )}
      </div>
      <ul className="space-y-1">
        {stages.map((stage, _index) => (
          <li
            key={stage.id}
            className="flex items-center gap-2 rounded-lg border border-surface-200 dark:border-surface-600 bg-surface-50 dark:bg-surface-800/50 px-3 py-2"
          >
            <GripVertical size={14} className="text-surface-400 shrink-0" />
            <div
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: stage.stage_color || '#94a3b8' }}
            />
            {editingId === stage.id ? (
              <EditStageForm
                stage={stage}
                onSave={(updates) => handleUpdate(stage.id, updates)}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <>
                <span className="flex-1 text-sm font-medium text-surface-800 dark:text-surface-200">
                  {stage.stage_name}
                </span>
                {stage.sla_hours != null && (
                  <span className="text-xs text-surface-500">SLA: {stage.sla_hours}h</span>
                )}
                <button
                  type="button"
                  onClick={() => setEditingId(stage.id)}
                  className="text-xs text-brand-600 dark:text-brand-400 hover:underline"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(stage.id)}
                  className="text-xs text-red-600 dark:text-red-400 hover:underline"
                >
                  Remove
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
      {showAdd && (
        <AddStageForm
          onAdd={handleCreate}
          onCancel={() => setShowAdd(false)}
        />
      )}
    </div>
  );
}

function EditStageForm({
  stage,
  onSave,
  onCancel,
}: {
  stage: PipelineStage;
  onSave: (u: { stage_name?: string; stage_color?: string; sla_hours?: number }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(stage.stage_name);
  const [color, setColor] = useState(stage.stage_color || '#94a3b8');
  const [sla, setSla] = useState(String(stage.sla_hours ?? ''));

  return (
    <div className="flex-1 flex flex-wrap items-center gap-2">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="flex-1 min-w-[120px] rounded border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 px-2 py-1 text-sm"
      />
      <input
        type="color"
        value={color}
        onChange={(e) => setColor(e.target.value)}
        className="w-8 h-8 rounded border border-surface-300 dark:border-surface-600 cursor-pointer"
      />
      <input
        type="number"
        placeholder="SLA (hours)"
        value={sla}
        onChange={(e) => setSla(e.target.value)}
        className="w-20 rounded border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 px-2 py-1 text-sm"
      />
      <button
        type="button"
        onClick={() => onSave({ stage_name: name, stage_color: color, sla_hours: sla ? parseInt(sla, 10) : undefined })}
        className="text-xs text-brand-600 dark:text-brand-400 hover:underline"
      >
        Save
      </button>
      <button type="button" onClick={onCancel} className="text-xs text-surface-500 hover:underline">
        Cancel
      </button>
    </div>
  );
}

function AddStageForm({
  onAdd,
  onCancel,
}: {
  onAdd: (name: string, color?: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#94a3b8');

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-surface-300 dark:border-surface-600 p-3">
      <input
        type="text"
        placeholder="Stage name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="flex-1 min-w-[140px] rounded border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 px-2 py-1.5 text-sm"
      />
      <input
        type="color"
        value={color}
        onChange={(e) => setColor(e.target.value)}
        className="w-8 h-8 rounded border border-surface-300 dark:border-surface-600 cursor-pointer"
      />
      <button
        type="button"
        onClick={() => name.trim() && onAdd(name.trim(), color)}
        disabled={!name.trim()}
        className="px-3 py-1.5 rounded bg-brand-500 text-white text-sm font-medium disabled:opacity-50"
      >
        Add
      </button>
      <button type="button" onClick={onCancel} className="text-sm text-surface-500 hover:underline">
        Cancel
      </button>
    </div>
  );
}
