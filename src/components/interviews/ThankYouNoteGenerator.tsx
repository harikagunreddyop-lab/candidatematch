'use client';

import { useState } from 'react';
import { Loader2, Mail, Copy, Check } from 'lucide-react';
import { cn } from '@/utils/helpers';

interface ThankYouNoteGeneratorProps {
  interviewId: string;
  interviewerName?: string | null;
  onSent?: () => void;
  className?: string;
}

export function ThankYouNoteGenerator({
  interviewId,
  interviewerName,
  onSent,
  className,
}: ThankYouNoteGeneratorProps) {
  const [note, setNote] = useState<{ subject: string; body: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<'subject' | 'body' | null>(null);
  const [markedSent, setMarkedSent] = useState(false);

  const generate = async () => {
    setLoading(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch(`/api/candidate/interviews/${interviewId}/generate-thank-you`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate');
      setNote(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const copy = (which: 'subject' | 'body') => {
    if (!note) return;
    const text = which === 'subject' ? note.subject : note.body;
    navigator.clipboard.writeText(text);
    setCopied(which);
    setTimeout(() => setCopied(null), 2000);
  };

  const markSent = async () => {
    try {
      await fetch(`/api/candidate/interviews/${interviewId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thank_you_sent: true }),
      });
      setMarkedSent(true);
      onSent?.();
    } catch {
      // ignore
    }
  };

  return (
    <div
      className={cn(
        'rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-100 dark:bg-surface-800/50 p-4 sm:p-5 space-y-4',
        className
      )}
    >
      <h4 className="font-medium text-surface-900 dark:text-surface-100 flex items-center gap-2">
        <Mail size={18} className="text-brand-500" />
        Thank-you note
      </h4>
      {interviewerName && (
        <p className="text-sm text-surface-500 dark:text-surface-400">To: {interviewerName}</p>
      )}
      {!note && !loading && !error && (
        <button
          type="button"
          onClick={generate}
          className="btn-primary text-sm py-2 px-4 inline-flex items-center gap-2"
        >
          Generate thank-you email
        </button>
      )}
      {loading && (
        <div className="flex items-center gap-2 text-surface-500 dark:text-surface-400">
          <Loader2 size={18} className="animate-spin" />
          Generating…
        </div>
      )}
      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-700 dark:text-red-400 text-sm">
          {error}
          <button type="button" onClick={generate} className="ml-2 underline">
            Retry
          </button>
        </div>
      )}
      {note && (
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-surface-500 dark:text-surface-400">Subject</label>
            <div className="flex items-center gap-2 mt-0.5">
              <input
                type="text"
                readOnly
                value={note.subject}
                className="input text-sm flex-1 dark:bg-surface-700 dark:border-surface-600"
              />
              <button
                type="button"
                onClick={() => copy('subject')}
                className="btn-ghost p-2 rounded-lg"
                aria-label="Copy subject"
              >
                {copied === 'subject' ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-surface-500 dark:text-surface-400">Body</label>
            <div className="relative mt-0.5">
              <textarea
                readOnly
                value={note.body}
                rows={8}
                className="input text-sm w-full min-h-[160px] dark:bg-surface-700 dark:border-surface-600 resize-y"
              />
              <button
                type="button"
                onClick={() => copy('body')}
                className="absolute top-2 right-2 btn-ghost p-2 rounded-lg"
                aria-label="Copy body"
              >
                {copied === 'body' ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
          </div>
          {!markedSent && (
            <button
              type="button"
              onClick={markSent}
              className="btn-secondary text-sm py-2 px-4"
            >
              I sent this thank-you
            </button>
          )}
          {markedSent && (
            <p className="text-sm text-green-600 dark:text-green-400">Marked as sent.</p>
          )}
        </div>
      )}
    </div>
  );
}
