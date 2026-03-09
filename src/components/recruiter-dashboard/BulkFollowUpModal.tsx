'use client';

import { useState, useEffect } from 'react';
import { X, Mail, Sparkles, Copy, Check } from 'lucide-react';
import type { FollowUpRecommendation } from '@/types/recruiter-dashboard';

interface BulkFollowUpModalProps {
  open: boolean;
  onClose: () => void;
}

function isFollowUpRecommendation(value: unknown): value is FollowUpRecommendation {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<FollowUpRecommendation>;
  return (
    typeof v.candidate_id === 'string' &&
    typeof v.candidate_name === 'string' &&
    typeof v.context === 'string' &&
    typeof v.days_since_contact === 'number' &&
    typeof v.urgency === 'string'
  );
}

export function BulkFollowUpModal({ open, onClose }: BulkFollowUpModalProps) {
  const [followUps, setFollowUps] = useState<FollowUpRecommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [generated, setGenerated] = useState<Record<string, { subject: string; body: string }>>({});
  const [generating, setGenerating] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);

  useEffect(() => {
    if (open) {
      setLoading(true);
      fetch('/api/recruiter/dashboard/follow-ups')
        .then(async (r) => {
          if (!r.ok) return [] as FollowUpRecommendation[];
          const data = await r.json();
          const list = Array.isArray(data?.follow_ups) ? data.follow_ups.filter(isFollowUpRecommendation) : [];
          return list as FollowUpRecommendation[];
        })
        .then((list) => {
          setFollowUps(list);
          setSelected(new Set(list.slice(0, 5).map((f: FollowUpRecommendation) => f.candidate_id)));
        })
        .catch(() => setFollowUps([]))
        .finally(() => setLoading(false));
    } else {
      setGenerated({});
    }
  }, [open]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const generateAll = async () => {
    setGenerating(true);
    const next: Record<string, { subject: string; body: string }> = {};
    for (const id of Array.from(selected)) {
      const fu = followUps.find((f) => f.candidate_id === id);
      if (!fu) continue;
      try {
        const res = await fetch('/api/recruiter/dashboard/follow-up-message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            candidate_id: fu.candidate_id,
            application_id: fu.application_id,
            context: fu.context,
          }),
        });
        const data = await res.json();
        if (res.ok) next[fu.candidate_id] = { subject: data.subject ?? '', body: data.body ?? '' };
      } catch {
        // skip
      }
    }
    setGenerated((prev) => ({ ...prev, ...next }));
    setGenerating(false);
  };

  const copyAll = async () => {
    const lines: string[] = [];
    for (const id of Array.from(selected)) {
      const g = generated[id];
      const fu = followUps.find((f) => f.candidate_id === id);
      if (!g || !fu) continue;
      lines.push(`--- ${fu.candidate_name} ---`);
      lines.push(`Subject: ${g.subject}`);
      lines.push(g.body);
      lines.push('');
    }
    await navigator.clipboard.writeText(lines.join('\n'));
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div
        className="bg-surface-100 border border-surface-600 rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-surface-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Mail className="w-5 h-5 text-brand-400" />
            Bulk follow-up
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-surface-400 hover:text-white hover:bg-surface-700"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 border-b border-surface-700 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={generateAll}
            disabled={generating || selected.size === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-500 text-[#0a0f00] font-medium hover:bg-brand-400 disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4" />
            {generating ? 'Generating…' : 'Generate messages for selected'}
          </button>
          <button
            type="button"
            onClick={copyAll}
            disabled={Object.keys(generated).length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-surface-600 text-surface-300 hover:bg-surface-700 disabled:opacity-50"
          >
            {copiedAll ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copiedAll ? 'Copied' : 'Copy all'}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="py-8 text-center text-surface-500">Loading…</div>
          ) : followUps.length === 0 ? (
            <p className="text-surface-500 text-sm">No follow-ups right now.</p>
          ) : (
            followUps.map((fu) => (
              <div
                key={fu.candidate_id}
                className="p-4 rounded-lg border border-surface-700 bg-surface-200/30"
              >
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected.has(fu.candidate_id)}
                    onChange={() => toggle(fu.candidate_id)}
                    className="mt-1 rounded border-surface-500 text-brand-500"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-white">{fu.candidate_name}</p>
                    <p className="text-xs text-surface-500">{fu.context}</p>
                    {generated[fu.candidate_id] && (
                      <div className="mt-3 p-3 rounded bg-surface-800 text-sm">
                        <p className="text-surface-400 text-xs font-medium">
                          {generated[fu.candidate_id].subject}
                        </p>
                        <p className="text-surface-300 whitespace-pre-wrap mt-1">
                          {generated[fu.candidate_id].body}
                        </p>
                      </div>
                    )}
                  </div>
                </label>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
