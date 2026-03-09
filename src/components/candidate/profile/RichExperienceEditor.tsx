'use client';

import { useState } from 'react';
import { Plus, Trash2, Sparkles, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/utils/helpers';
import type { Experience } from '@/types';

export interface RichExperienceEditorProps {
  value: Experience[];
  onChange: (experience: Experience[]) => void;
  disabled?: boolean;
  className?: string;
}

const emptyEntry: Experience = {
  company: '',
  title: '',
  start_date: '',
  end_date: '',
  current: false,
  responsibilities: [],
};

function responsibilitiesToText(resp: string[]): string {
  return (resp || []).join('\n');
}

function textToResponsibilities(text: string): string[] {
  return text
    .split(/\n/)
    .map((s) => s.replace(/^[\s•\-*]+/, '').trim())
    .filter(Boolean);
}

export function RichExperienceEditor({
  value,
  onChange,
  disabled,
  className,
}: RichExperienceEditorProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0);
  const [aiLoadingIndex, setAiLoadingIndex] = useState<number | null>(null);

  const entries = value?.length ? [...value] : [];
  const canAdd = !disabled && entries.length < 20;

  const addEntry = () => {
    onChange([...entries, { ...emptyEntry }]);
    setExpandedIndex(entries.length);
  };

  const removeEntry = (index: number) => {
    const next = entries.filter((_, i) => i !== index);
    onChange(next);
    if (expandedIndex === index) setExpandedIndex(null);
    else if (expandedIndex != null && expandedIndex > index) setExpandedIndex(expandedIndex - 1);
  };

  const updateEntry = (index: number, patch: Partial<Experience>) => {
    const next = entries.map((e, i) => (i === index ? { ...e, ...patch } : e));
    onChange(next);
  };

  const runAiImprove = async (index: number) => {
    const entry = entries[index];
    const text = responsibilitiesToText(entry.responsibilities || []);
    if (text.length < 10) {
      return;
    }
    setAiLoadingIndex(index);
    try {
      const res = await fetch('/api/candidate/profile/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section: 'experience', content: text }),
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(data.suggestions) && data.suggestions.length > 0) {
        const improved = data.suggestions[0];
        const bullets = improved.split(/\n/).map((s: string) => s.replace(/^[\s•\-*]+/, '').trim()).filter(Boolean);
        updateEntry(index, { responsibilities: bullets });
      }
    } finally {
      setAiLoadingIndex(null);
    }
  };

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-surface-800 dark:text-surface-100">Experience</h4>
        {canAdd && (
          <button
            type="button"
            onClick={addEntry}
            className="flex items-center gap-1.5 text-sm text-brand-600 dark:text-brand-400 hover:underline"
          >
            <Plus className="w-4 h-4" /> Add experience
          </button>
        )}
      </div>

      {entries.length === 0 && (
        <p className="text-sm text-surface-500 dark:text-surface-400">No experience entries. Click “Add experience” to add one.</p>
      )}

      {entries.map((entry, index) => (
        <div
          key={index}
          className="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800/50 overflow-hidden"
        >
          <button
            type="button"
            onClick={() => setExpandedIndex(expandedIndex === index ? null : index)}
            className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left"
          >
            <span className="text-sm font-medium text-surface-800 dark:text-surface-100 truncate">
              {entry.title || 'Untitled role'} at {entry.company || 'Company'}
            </span>
            {expandedIndex === index ? (
              <ChevronUp className="w-4 h-4 shrink-0 text-surface-500" />
            ) : (
              <ChevronDown className="w-4 h-4 shrink-0 text-surface-500" />
            )}
          </button>
          {expandedIndex === index && (
            <div className="px-4 pb-4 pt-0 space-y-3 border-t border-surface-200 dark:border-surface-700">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label text-xs">Company</label>
                  <input
                    type="text"
                    value={entry.company}
                    onChange={(e) => updateEntry(index, { company: e.target.value })}
                    disabled={disabled}
                    className="input text-sm w-full dark:bg-surface-700 dark:border-surface-600 dark:text-surface-100"
                    placeholder="Company name"
                  />
                </div>
                <div>
                  <label className="label text-xs">Job title</label>
                  <input
                    type="text"
                    value={entry.title}
                    onChange={(e) => updateEntry(index, { title: e.target.value })}
                    disabled={disabled}
                    className="input text-sm w-full dark:bg-surface-700 dark:border-surface-600 dark:text-surface-100"
                    placeholder="Job title"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="label text-xs">Start</label>
                  <input
                    type="text"
                    value={entry.start_date}
                    onChange={(e) => updateEntry(index, { start_date: e.target.value })}
                    disabled={disabled}
                    className="input text-sm w-full dark:bg-surface-700 dark:border-surface-600 dark:text-surface-100"
                    placeholder="e.g. Jan 2020"
                  />
                </div>
                <div>
                  <label className="label text-xs">End</label>
                  <input
                    type="text"
                    value={entry.end_date}
                    onChange={(e) => updateEntry(index, { end_date: e.target.value })}
                    disabled={disabled}
                    className="input text-sm w-full dark:bg-surface-700 dark:border-surface-600 dark:text-surface-100"
                    placeholder="e.g. Present"
                  />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 cursor-pointer pb-2">
                    <input
                      type="checkbox"
                      checked={entry.current}
                      onChange={(e) => updateEntry(index, { current: e.target.checked })}
                      disabled={disabled}
                      className="rounded border-surface-300 dark:border-surface-600 text-brand-600"
                    />
                    <span className="text-sm text-surface-700 dark:text-surface-200">Current</span>
                  </label>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label className="label text-xs">Responsibilities (one per line)</label>
                  {responsibilitiesToText(entry.responsibilities ?? []).length >= 10 && (
                    <button
                      type="button"
                      onClick={() => runAiImprove(index)}
                      disabled={disabled || aiLoadingIndex !== null}
                      className="text-xs px-2 py-1 rounded-lg bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50 flex items-center gap-1"
                    >
                      {aiLoadingIndex === index ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Sparkles className="w-3 h-3" />
                      )}
                      Improve with AI
                    </button>
                  )}
                </div>
                <textarea
                  value={responsibilitiesToText(entry.responsibilities ?? [])}
                  onChange={(e) =>
                    updateEntry(index, {
                      responsibilities: textToResponsibilities(e.target.value),
                    })
                  }
                  disabled={disabled}
                  rows={4}
                  className="input text-sm w-full resize-y dark:bg-surface-700 dark:border-surface-600 dark:text-surface-100"
                  placeholder="• Bullet one
• Bullet two"
                />
              </div>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removeEntry(index)}
                  className="text-sm text-red-600 dark:text-red-400 hover:underline flex items-center gap-1"
                >
                  <Trash2 className="w-4 h-4" /> Remove
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
