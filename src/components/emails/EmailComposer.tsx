'use client';

import { useState, useCallback } from 'react';
import { Send, Loader2 } from 'lucide-react';

export interface EmailComposerProps {
  defaultTo?: string[];
  defaultSubject?: string;
  defaultBody?: string;
  relatedCandidateId?: string | null;
  relatedApplicationId?: string | null;
  onSent?: () => void;
  onCancel?: () => void;
  className?: string;
}

export function EmailComposer({
  defaultTo = [],
  defaultSubject = '',
  defaultBody = '',
  relatedCandidateId = null,
  relatedApplicationId = null,
  onSent,
  onCancel,
  className = '',
}: EmailComposerProps) {
  const [to, setTo] = useState(defaultTo.join(', '));
  const [cc, setCc] = useState('');
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSend = useCallback(async () => {
    const toList = to.split(/[,;]/).map((e) => e.trim()).filter(Boolean);
    if (toList.length === 0) {
      setError('Enter at least one recipient');
      return;
    }
    setError(null);
    setSending(true);
    try {
      const res = await fetch('/api/emails/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          to: toList,
          cc: cc ? cc.split(/[,;]/).map((e) => e.trim()).filter(Boolean) : undefined,
          subject,
          body_html: body.replace(/\n/g, '<br>\n'),
          related_candidate_id: relatedCandidateId,
          related_application_id: relatedApplicationId,
          tracking_enabled: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Failed to send');
        return;
      }
      onSent?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  }, [to, cc, subject, body, relatedCandidateId, relatedApplicationId, onSent]);

  return (
    <div className={className}>
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-surface-500 dark:text-surface-400 mb-1">To</label>
          <input
            type="text"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="email@example.com, other@example.com"
            className="input w-full text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-surface-500 dark:text-surface-400 mb-1">Cc (optional)</label>
          <input
            type="text"
            value={cc}
            onChange={(e) => setCc(e.target.value)}
            placeholder="cc@example.com"
            className="input w-full text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-surface-500 dark:text-surface-400 mb-1">Subject</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            className="input w-full text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-surface-500 dark:text-surface-400 mb-1">Message</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your message..."
            rows={8}
            className="input w-full text-sm resize-y"
          />
        </div>
        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleSend}
            disabled={sending}
            className="btn-primary inline-flex items-center gap-2 text-sm"
          >
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            {sending ? 'Sending…' : 'Send'}
          </button>
          {onCancel && (
            <button type="button" onClick={onCancel} className="btn-secondary text-sm">
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
