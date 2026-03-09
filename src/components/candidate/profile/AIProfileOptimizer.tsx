'use client';

import { useState } from 'react';
import { Sparkles, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/utils/helpers';

type Section = 'experience' | 'summary' | 'skills';

export interface AIProfileOptimizerProps {
  section: Section;
  content: string;
  onApplySuggestion?: (suggestion: string) => void;
  disabled?: boolean;
  className?: string;
}

export function AIProfileOptimizer({
  section,
  content,
  onApplySuggestion,
  disabled,
  className,
}: AIProfileOptimizerProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    suggestions: string[];
    score: number;
    reasoning: string;
  } | null>(null);
  const [expanded, setExpanded] = useState(false);

  const runOptimize = async () => {
    if (content.length < 10) {
      setError('Add at least 10 characters to get suggestions.');
      return;
    }
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const res = await fetch('/api/candidate/profile/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section, content }),
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Optimization failed');
        return;
      }
      setResult({
        suggestions: data.suggestions ?? [],
        score: data.score ?? 50,
        reasoning: data.reasoning ?? '',
      });
      setExpanded(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={cn('rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800/50 p-4', className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-surface-700 dark:text-surface-200 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-brand-500" />
          AI optimization
        </span>
        <button
          type="button"
          onClick={runOptimize}
          disabled={disabled || loading}
          className="text-sm px-3 py-1.5 rounded-lg bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50 flex items-center gap-2"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          Get suggestions
        </button>
      </div>
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400 mt-2" role="alert">
          {error}
        </p>
      )}
      {result && (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-surface-500 dark:text-surface-400">
            Score: <strong className="text-surface-700 dark:text-surface-200">{result.score}/100</strong>
          </p>
          {result.reasoning && (
            <p className="text-sm text-surface-600 dark:text-surface-300">{result.reasoning}</p>
          )}
          {result.suggestions.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setExpanded((e) => !e)}
                className="text-xs font-medium text-brand-600 dark:text-brand-400 flex items-center gap-1"
              >
                {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                {result.suggestions.length} suggestions
              </button>
              {expanded && (
                <ul className="list-disc list-inside text-sm text-surface-600 dark:text-surface-300 space-y-1">
                  {result.suggestions.map((s, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span>{s}</span>
                      {onApplySuggestion && (
                        <button
                          type="button"
                          onClick={() => onApplySuggestion(s)}
                          className="text-brand-600 dark:text-brand-400 hover:underline shrink-0"
                        >
                          Apply
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
