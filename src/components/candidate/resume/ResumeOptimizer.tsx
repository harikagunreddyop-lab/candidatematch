'use client';

import { useState } from 'react';
import { Sparkles, Copy, Check } from 'lucide-react';
import { Spinner } from '@/components/ui';
import { cn } from '@/utils/helpers';

export interface OptimizedSection {
  section: string;
  original: string;
  optimized: string;
  improvement_score: number;
  reasoning: string;
}

export interface ResumeOptimizerProps {
  resumeId: string;
  onRun: (resumeId: string, focusArea?: string) => Promise<{
    optimized_sections: OptimizedSection[];
    new_ats_score: number;
    recommendations?: string[];
  }>;
  className?: string;
}

export function ResumeOptimizer({ resumeId, onRun, className }: ResumeOptimizerProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    optimized_sections: OptimizedSection[];
    new_ats_score: number;
    recommendations?: string[];
  } | null>(null);
  const [focusArea, setFocusArea] = useState<string>('all');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const run = async () => {
    setLoading(true);
    setResult(null);
    try {
      const data = await onRun(resumeId, focusArea);
      setResult(data);
    } finally {
      setLoading(false);
    }
  };

  const copyOptimized = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div className={cn('rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800/50 overflow-hidden', className)}>
      <div className="px-4 py-3 border-b border-surface-200 dark:border-surface-700 flex flex-wrap items-center gap-3">
        <Sparkles className="w-5 h-5 text-brand-500" />
        <span className="font-medium text-surface-900 dark:text-surface-100">AI Resume Optimizer</span>
        <select
          value={focusArea}
          onChange={(e) => setFocusArea(e.target.value)}
          className="input text-sm py-1.5 px-2 dark:bg-surface-700 dark:border-surface-600"
        >
          <option value="all">Improve all</option>
          <option value="keywords">Keywords</option>
          <option value="impact">Impact & metrics</option>
          <option value="formatting">Formatting</option>
        </select>
        <button
          type="button"
          onClick={run}
          disabled={loading}
          className="btn-primary text-sm py-2 px-4 flex items-center gap-2"
        >
          {loading ? <Spinner size={14} /> : <Sparkles size={14} />}
          {loading ? 'Optimizing…' : 'Get suggestions'}
        </button>
      </div>

      {result && (
        <div className="p-4 space-y-4">
          {result.new_ats_score != null && (
            <p className="text-sm text-surface-600 dark:text-surface-300">
              Estimated ATS score after changes: <strong className="text-surface-900 dark:text-surface-100">{result.new_ats_score}</strong>
            </p>
          )}
          {result.optimized_sections?.length ? (
            <div className="space-y-4">
              {result.optimized_sections.map((s, i) => (
                <div key={i} className="rounded-lg border border-surface-200 dark:border-surface-600 p-3 space-y-2">
                  <p className="text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase">{s.section}</p>
                  {s.original && (
                    <div>
                      <p className="text-xs text-surface-500 dark:text-surface-400 mb-0.5">Original</p>
                      <p className="text-sm text-surface-700 dark:text-surface-300 bg-surface-100 dark:bg-surface-700/50 p-2 rounded">{s.original}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-surface-500 dark:text-surface-400 mb-0.5">Suggested</p>
                    <div className="flex gap-2">
                      <p className="text-sm text-surface-800 dark:text-surface-200 bg-brand-50 dark:bg-brand-900/20 p-2 rounded flex-1">{s.optimized}</p>
                      <button
                        type="button"
                        onClick={() => copyOptimized(s.optimized, i)}
                        className="p-2 rounded hover:bg-surface-200 dark:hover:bg-surface-600 shrink-0"
                        title="Copy"
                      >
                        {copiedIndex === i ? <Check size={16} /> : <Copy size={16} />}
                      </button>
                    </div>
                  </div>
                  {s.reasoning && (
                    <p className="text-xs text-surface-500 dark:text-surface-400 italic">{s.reasoning}</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-surface-500 dark:text-surface-400">No section suggestions returned. Try a different focus or re-upload the resume.</p>
          )}
          {result.recommendations?.length ? (
            <div>
              <p className="text-xs font-semibold text-surface-600 dark:text-surface-400 mb-1">Recommendations</p>
              <ul className="text-sm text-surface-600 dark:text-surface-300 list-disc list-inside space-y-0.5">
                {result.recommendations.slice(0, 5).map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
