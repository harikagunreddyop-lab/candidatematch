'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Mail, Phone, MessageCircle, ChevronRight, Sparkles, Copy, Check } from 'lucide-react';
import type { FollowUpRecommendation } from '@/types/recruiter-dashboard';

const ACTION_ICONS = {
  email: Mail,
  call: Phone,
  linkedin_message: MessageCircle,
};

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

export function FollowUpQueue({ onBulkFollowUp }: { onBulkFollowUp?: () => void }) {
  const [followUps, setFollowUps] = useState<FollowUpRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [messageForId, setMessageForId] = useState<{ id: string; subject: string; body: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/recruiter/dashboard/follow-ups')
      .then(async (r) => {
        if (!r.ok) return [] as FollowUpRecommendation[];
        const data = await r.json();
        const list = Array.isArray(data?.follow_ups) ? data.follow_ups.filter(isFollowUpRecommendation) : [];
        return list as FollowUpRecommendation[];
      })
      .then((safeFollowUps) => setFollowUps(safeFollowUps))
      .catch(() => setFollowUps([]))
      .finally(() => setLoading(false));
  }, []);

  const handleGenerate = async (fu: FollowUpRecommendation) => {
    setGeneratingId(fu.candidate_id);
    setMessageForId(null);
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
      if (res.ok)
        setMessageForId({ id: fu.candidate_id, subject: data.subject ?? '', body: data.body ?? '' });
    } finally {
      setGeneratingId(null);
    }
  };

  const handleCopy = async (id: string, subject: string, body: string) => {
    const text = `Subject: ${subject}\n\n${body}`;
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (loading) {
    return (
      <div className="bg-surface-100 border border-surface-700/60 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Follow-up Queue</h3>
        <div className="h-24 animate-pulse bg-surface-200 rounded" />
      </div>
    );
  }

  if (followUps.length === 0) {
    return (
      <div className="bg-surface-100 border border-surface-700/60 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Follow-up Queue</h3>
        <p className="text-surface-500 text-sm">No follow-ups recommended right now.</p>
      </div>
    );
  }

  return (
    <div className="bg-surface-100 border border-surface-700/60 rounded-xl overflow-hidden">
      <div className="p-4 border-b border-surface-700/60 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-lg font-semibold text-white">Follow-up Queue</h3>
          <p className="text-sm text-surface-400 mt-0.5">
            Candidates to reach out to (by urgency)
          </p>
        </div>
        {onBulkFollowUp && (
          <button
            type="button"
            onClick={onBulkFollowUp}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-brand-500/20 text-brand-300 hover:bg-brand-500/30 text-sm font-medium"
          >
            <Mail className="w-4 h-4" />
            Bulk follow-up
          </button>
        )}
      </div>
      <ul className="divide-y divide-surface-700/50 max-h-80 overflow-y-auto">
        {followUps.slice(0, 10).map((fu) => {
          const Icon = ACTION_ICONS[fu.recommended_action] ?? Mail;
          const message = messageForId?.id === fu.candidate_id ? messageForId : null;
          return (
            <li key={fu.candidate_id}>
              <div className="flex items-start gap-3 p-4 hover:bg-surface-200/30 transition-colors group">
                <span
                  className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
                    fu.urgency === 'high'
                      ? 'bg-red-500/20 text-red-400'
                      : fu.urgency === 'medium'
                        ? 'bg-amber-500/20 text-amber-400'
                        : 'bg-surface-500/20 text-surface-400'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      href={`/dashboard/recruiter/candidates/${fu.candidate_id}`}
                      className="font-medium text-white truncate hover:text-brand-400"
                    >
                      {fu.candidate_name}
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleGenerate(fu)}
                      disabled={generatingId === fu.candidate_id}
                      className="flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-surface-600 hover:bg-surface-500 text-surface-300 disabled:opacity-50"
                    >
                      {generatingId === fu.candidate_id ? (
                        <>Generating…</>
                      ) : (
                        <>
                          <Sparkles className="w-3 h-3" />
                          Generate
                        </>
                      )}
                    </button>
                  </div>
                  <p className="text-xs text-surface-500 truncate">{fu.context}</p>
                  <p className="text-xs text-surface-500 mt-0.5">
                    {fu.days_since_contact} days since contact
                    {fu.success_probability != null &&
                      ` · ${fu.success_probability}% response probability`}
                  </p>
                  {message && (
                    <div className="mt-3 p-3 rounded-lg bg-surface-800 border border-surface-600 text-sm">
                      <p className="text-surface-400 font-medium text-xs mb-1">{message.subject}</p>
                      <p className="text-surface-300 whitespace-pre-wrap">{message.body}</p>
                      <button
                        type="button"
                        onClick={() => handleCopy(fu.candidate_id, message.subject, message.body)}
                        className="mt-2 flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300"
                      >
                        {copiedId === fu.candidate_id ? (
                          <Check className="w-3 h-3" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        {copiedId === fu.candidate_id ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  )}
                </div>
                <Link
                  href={`/dashboard/recruiter/candidates/${fu.candidate_id}`}
                  className="shrink-0 text-surface-500 hover:text-brand-400"
                  aria-label="Open candidate"
                >
                  <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
