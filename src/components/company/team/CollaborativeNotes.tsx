'use client';

import { useCallback, useEffect, useState } from 'react';
import { MessageSquare, Send, Lock } from 'lucide-react';
import { cn, formatRelative } from '@/utils/helpers';

interface NoteRow {
  id: string;
  note_text: string;
  note_type: string | null;
  is_private: boolean;
  created_at: string;
  author_id: string | null;
  author?: { id: string; name: string | null; email: string | null } | null;
}

export interface CollaborativeNotesProps {
  candidateId: string;
  candidateName?: string;
  className?: string;
}

export function CollaborativeNotes({ candidateId, candidateName, className }: CollaborativeNotesProps) {
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fetchNotes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/company/candidates/${candidateId}/notes`);
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setNotes(data.notes ?? []);
    } catch {
      setNotes([]);
    } finally {
      setLoading(false);
    }
  }, [candidateId]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/company/candidates/${candidateId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          note_text: newNote.trim(),
          note_type: 'general',
          is_private: isPrivate,
        }),
      });
      if (!res.ok) throw new Error('Failed to add note');
      const saved = await res.json();
      setNotes((prev) => [saved, ...prev]);
      setNewNote('');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className={cn('rounded-xl border border-surface-200 dark:border-surface-600 p-6', className)}>
        <div className="animate-pulse space-y-3">
          <div className="h-5 bg-surface-200 dark:bg-surface-600 rounded w-1/4" />
          <div className="h-20 bg-surface-100 dark:bg-surface-700 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className={cn('rounded-xl border border-surface-200 dark:border-surface-600 bg-surface-50 dark:bg-surface-800/50 overflow-hidden', className)}>
      <div className="flex items-center gap-2 px-4 py-3 border-b border-surface-200 dark:border-surface-600">
        <MessageSquare size={18} className="text-surface-500" />
        <h3 className="font-semibold text-surface-800 dark:text-surface-200">
          Team notes {candidateName && `· ${candidateName}`}
        </h3>
      </div>
      <form onSubmit={handleSubmit} className="p-4 border-b border-surface-200 dark:border-surface-600">
        <textarea
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          placeholder="Add a note... Use @ to mention teammates (e.g. @john)"
          rows={3}
          className="w-full rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 px-3 py-2 text-sm resize-none"
        />
        <div className="flex items-center justify-between gap-2 mt-2">
          <label className="flex items-center gap-2 text-sm text-surface-600 dark:text-surface-400">
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
              className="rounded border-surface-300 dark:border-surface-600 text-brand-500"
            />
            <Lock size={14} /> Private (only you)
          </label>
          <button
            type="submit"
            disabled={submitting || !newNote.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-500 text-white text-sm font-medium disabled:opacity-50"
          >
            <Send size={14} /> Add note
          </button>
        </div>
      </form>
      <ul className="divide-y divide-surface-200 dark:divide-surface-600 max-h-[320px] overflow-y-auto">
        {notes.length === 0 ? (
          <li className="p-6 text-center text-surface-500 text-sm">No notes yet.</li>
        ) : (
          notes.map((n) => (
            <li key={n.id} className="px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-surface-700 dark:text-surface-300">
                  {n.author?.name || n.author?.email || 'Unknown'}
                </span>
                <span className="text-xs text-surface-500 flex items-center gap-1">
                  {n.is_private && <Lock size={10} />}
                  {formatRelative(n.created_at)}
                </span>
              </div>
              <p className="text-sm text-surface-800 dark:text-surface-200 mt-0.5 whitespace-pre-wrap">
                {n.note_text}
              </p>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
