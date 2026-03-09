'use client';

import { useMemo } from 'react';
import { cn } from '@/utils/helpers';

export interface KeywordHeatmapProps {
  text: string;
  matchedKeywords: string[];
  missingKeywords: string[];
  className?: string;
}

/**
 * Renders resume text with matched keywords highlighted green.
 * Missing keywords are listed below (they do not appear in text).
 */
export function KeywordHeatmap({
  text,
  matchedKeywords = [],
  missingKeywords = [],
  className,
}: KeywordHeatmapProps) {
  const segments = useMemo(() => {
    if (!text.trim()) return [{ type: 'text' as const, value: text }];
    const lower = text.toLowerCase();
    const parts: Array<{ start: number; end: number; type: 'match' }> = [];
    for (const kw of matchedKeywords) {
      const norm = kw.toLowerCase().trim();
      if (!norm) continue;
      let pos = 0;
      while (pos < lower.length) {
        const idx = lower.indexOf(norm, pos);
        if (idx === -1) break;
        const before = idx === 0 || /\W/.test(text[idx - 1]);
        const after = idx + norm.length >= text.length || /\W/.test(text[idx + norm.length]);
        if (before && after) {
          parts.push({ start: idx, end: idx + norm.length, type: 'match' });
        }
        pos = idx + 1;
      }
    }
    parts.sort((a, b) => a.start - b.start);
    const merged: Array<{ start: number; end: number; type: 'match' }> = [];
    for (const p of parts) {
      if (merged.length && p.start <= merged[merged.length - 1].end) {
        merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, p.end);
      } else {
        merged.push({ ...p });
      }
    }
    const result: Array<{ type: 'text' | 'match'; value: string }> = [];
    let i = 0;
    for (const m of merged) {
      if (m.start > i) result.push({ type: 'text', value: text.slice(i, m.start) });
      result.push({ type: 'match', value: text.slice(m.start, m.end) });
      i = m.end;
    }
    if (i < text.length) result.push({ type: 'text', value: text.slice(i) });
    return result.length ? result : [{ type: 'text' as const, value: text }];
  }, [text, matchedKeywords]);

  if (!text && !missingKeywords.length) {
    return (
      <div className={cn('text-sm text-surface-500 dark:text-surface-400 p-4', className)}>
        No text to display. Upload a resume to see keyword highlights.
      </div>
    );
  }

  return (
    <div className={cn('rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800/50 p-4', className)}>
      <div className="text-sm text-surface-700 dark:text-surface-200 whitespace-pre-wrap break-words max-h-64 overflow-y-auto">
        {segments.map((p, i) =>
          p.type === 'text' ? (
            <span key={i}>{p.value}</span>
          ) : (
            <mark key={i} className="bg-emerald-200 dark:bg-emerald-800/60 text-emerald-900 dark:text-emerald-100 rounded px-0.5">
              {p.value}
            </mark>
          )
        )}
      </div>
      {missingKeywords.length > 0 && (
        <div className="mt-3 pt-3 border-t border-surface-200 dark:border-surface-600">
          <p className="text-xs font-medium text-surface-600 dark:text-surface-400 mb-1">Consider adding:</p>
          <div className="flex flex-wrap gap-1.5">
            {missingKeywords.slice(0, 10).map((k, i) => (
              <span key={i} className="px-2 py-0.5 rounded text-xs bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200">
                {k}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
