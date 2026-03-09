'use client';

import { useState } from 'react';
import { Loader2, Send, Star } from 'lucide-react';
import type { STARMethod } from '@/types/interviews';
import { cn } from '@/utils/helpers';

const STAR_LABELS = {
  situation: 'Situation – Describe the context',
  task: 'Task – What was your responsibility?',
  action: 'Action – What did you do?',
  result: 'Result – What was the outcome?',
} as const;

interface STARMethodBuilderProps {
  questionText: string;
  questionId?: string;
  initialStar?: STARMethod | null;
  initialAnswer?: string | null;
  onSave?: (star: STARMethod, answer?: string) => void | Promise<void>;
  getFeedback?: () => Promise<string>;
  className?: string;
}

export function STARMethodBuilder({
  questionText,
  questionId: _questionId,
  initialStar,
  initialAnswer,
  onSave,
  getFeedback,
  className,
}: STARMethodBuilderProps) {
  const [star, setStar] = useState<STARMethod>({
    situation: initialStar?.situation ?? '',
    task: initialStar?.task ?? '',
    action: initialStar?.action ?? '',
    result: initialStar?.result ?? '',
  });
  const [freeform, setFreeform] = useState(initialAnswer ?? '');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleGetFeedback = async () => {
    if (!getFeedback) return;
    await Promise.resolve(onSave?.(star, freeform));
    setLoading(true);
    setFeedback(null);
    try {
      const text = await getFeedback();
      setFeedback(text);
    } finally {
      setLoading(false);
    }
  };

  const hasContent = star.situation || star.task || star.action || star.result || freeform.trim();

  return (
    <div
      className={cn(
        'rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-100 dark:bg-surface-800/50 p-4 sm:p-5 space-y-4',
        className
      )}
      role="form"
      aria-label="STAR method response builder"
    >
      <h4 className="font-medium text-surface-900 dark:text-surface-100 flex items-center gap-2">
        <Star size={16} className="text-amber-500" />
        STAR method
      </h4>
      <p className="text-sm text-surface-600 dark:text-surface-300">{questionText}</p>

      <div className="grid gap-3">
        {(Object.keys(STAR_LABELS) as Array<keyof typeof STAR_LABELS>).map((key) => (
          <div key={key}>
            <label className="block text-xs font-medium text-surface-500 dark:text-surface-400 mb-1">
              {STAR_LABELS[key]}
            </label>
            <textarea
              value={star[key] ?? ''}
              onChange={(e) => setStar((s) => ({ ...s, [key]: e.target.value }))}
              onBlur={() => onSave?.(star)}
              className="input text-sm w-full min-h-[72px] dark:bg-surface-700 dark:border-surface-600 dark:text-surface-100"
              placeholder={STAR_LABELS[key]}
              rows={2}
            />
          </div>
        ))}
      </div>

      <div>
        <label className="block text-xs font-medium text-surface-500 dark:text-surface-400 mb-1">
          Or write your full answer (freeform)
        </label>
        <textarea
          value={freeform}
          onChange={(e) => setFreeform(e.target.value)}
          onBlur={() => onSave?.(star, freeform)}
          className="input text-sm w-full min-h-[80px] dark:bg-surface-700 dark:border-surface-600 dark:text-surface-100"
          placeholder="Paste or type your full answer…"
          rows={3}
        />
      </div>

      {getFeedback && (
        <>
          <button
            type="button"
            onClick={handleGetFeedback}
            disabled={loading || !hasContent}
            className="btn-primary text-sm py-2 px-4 inline-flex items-center gap-2"
          >
            {loading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Send size={14} />
            )}
            Get AI feedback
          </button>
          {feedback && (
            <div className="p-4 rounded-lg bg-brand-500/10 dark:bg-brand-500/20 border border-brand-500/20">
              <h5 className="text-xs font-semibold text-brand-700 dark:text-brand-300 mb-2">AI feedback</h5>
              <p className="text-sm text-surface-700 dark:text-surface-200 whitespace-pre-wrap">{feedback}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
