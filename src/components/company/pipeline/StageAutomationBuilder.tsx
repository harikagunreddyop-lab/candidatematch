'use client';

import { useState } from 'react';
import { Zap, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/utils/helpers';
import type { AutoMoveRule } from '@/types/pipeline';

export interface StageAutomationBuilderProps {
  stageId: string;
  stageName: string;
  rules: AutoMoveRule[];
  onSave: (rules: AutoMoveRule[]) => Promise<void>;
  className?: string;
}

export function StageAutomationBuilder({
  stageId: _stageId,
  stageName,
  rules,
  onSave,
  className,
}: StageAutomationBuilderProps) {
  const [localRules, setLocalRules] = useState<AutoMoveRule[]>(rules);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newCondition, setNewCondition] = useState('');
  const [newAction, setNewAction] = useState<'move_to_stage' | 'send_email' | 'assign_recruiter'>('move_to_stage');
  const [newParams, setNewParams] = useState('{}');

  const handleAdd = () => {
    if (!newCondition.trim()) return;
    try {
      const params = JSON.parse(newParams || '{}');
      setLocalRules((prev) => [...prev, { condition: newCondition.trim(), action: newAction, params }]);
      setNewCondition('');
      setNewParams('{}');
      setAdding(false);
    } catch {
      setNewParams('{}');
    }
  };

  const handleRemove = (index: number) => {
    setLocalRules((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(localRules);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={cn('rounded-xl border border-surface-200 dark:border-surface-600 bg-surface-50 dark:bg-surface-800/50 p-4', className)}>
      <h4 className="font-semibold text-surface-800 dark:text-surface-200 flex items-center gap-2">
        <Zap size={16} /> Automation: {stageName}
      </h4>
      <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">
        When conditions match, run an action (e.g. move to next stage, send email).
      </p>
      <ul className="mt-3 space-y-2">
        {localRules.map((r, i) => (
          <li
            key={i}
            className="flex items-center justify-between rounded-lg border border-surface-200 dark:border-surface-600 bg-white dark:bg-surface-800 px-3 py-2 text-sm"
          >
            <span className="text-surface-700 dark:text-surface-200">
              <code className="text-xs bg-surface-100 dark:bg-surface-700 px-1 rounded">{r.condition}</code>
              {' → '}
              <span className="text-brand-600 dark:text-brand-400">{r.action}</span>
            </span>
            <button
              type="button"
              onClick={() => handleRemove(i)}
              className="p-1 text-surface-400 hover:text-red-500"
              aria-label="Remove rule"
            >
              <Trash2 size={14} />
            </button>
          </li>
        ))}
      </ul>
      {adding ? (
        <div className="mt-3 space-y-2 p-3 rounded-lg border border-dashed border-surface-300 dark:border-surface-600">
          <input
            type="text"
            placeholder="Condition (e.g. resume_score > 80)"
            value={newCondition}
            onChange={(e) => setNewCondition(e.target.value)}
            className="w-full rounded border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 px-2 py-1.5 text-sm"
          />
          <select
            value={newAction}
            onChange={(e) => setNewAction(e.target.value as AutoMoveRule['action'])}
            className="rounded border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 px-2 py-1.5 text-sm"
          >
            <option value="move_to_stage">Move to stage</option>
            <option value="send_email">Send email</option>
            <option value="assign_recruiter">Assign recruiter</option>
          </select>
          <input
            type="text"
            placeholder='Params JSON e.g. {"stage_id": "..."}'
            value={newParams}
            onChange={(e) => setNewParams(e.target.value)}
            className="w-full rounded border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 px-2 py-1.5 text-sm font-mono text-xs"
          />
          <div className="flex gap-2">
            <button type="button" onClick={handleAdd} className="px-2 py-1 rounded bg-brand-500 text-white text-sm">
              Add rule
            </button>
            <button type="button" onClick={() => setAdding(false)} className="px-2 py-1 rounded border text-sm">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-3 inline-flex items-center gap-1 text-sm text-brand-600 dark:text-brand-400 hover:underline"
        >
          <Plus size={14} /> Add rule
        </button>
      )}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || JSON.stringify(localRules) === JSON.stringify(rules)}
          className="px-3 py-1.5 rounded-lg bg-brand-500 text-white text-sm font-medium disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save automation'}
        </button>
      </div>
    </div>
  );
}
