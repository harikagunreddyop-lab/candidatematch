'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  GitBranch,
  Users,
  Briefcase,
  FileText,
  Search,
  Plus,
  ClipboardList,
  HelpCircle,
} from 'lucide-react';

export interface CommandPaletteAction {
  id: string;
  label: string;
  keywords?: string;
  icon?: React.ReactNode;
  run: () => void;
}

export function CommandPalette({
  open,
  onClose,
  actions: customActions,
  onShowShortcuts,
}: {
  open: boolean;
  onClose: () => void;
  actions?: CommandPaletteAction[];
  onShowShortcuts?: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const defaultActions: CommandPaletteAction[] = useMemo(
    () => [
      { id: 'dashboard', label: 'Go to Dashboard', keywords: 'home', icon: <LayoutDashboard className="w-4 h-4" />, run: () => router.push('/dashboard/recruiter') },
      { id: 'pipeline', label: 'Go to Pipeline', keywords: 'board', icon: <GitBranch className="w-4 h-4" />, run: () => router.push('/dashboard/recruiter/pipeline') },
      { id: 'candidates', label: 'Go to Candidates', keywords: 'people', icon: <Users className="w-4 h-4" />, run: () => router.push('/dashboard/recruiter/candidates') },
      { id: 'jobs', label: 'Go to Jobs', keywords: 'openings', icon: <Briefcase className="w-4 h-4" />, run: () => router.push('/dashboard/recruiter/jobs') },
      { id: 'applications', label: 'Go to Applications', keywords: 'apps', icon: <FileText className="w-4 h-4" />, run: () => router.push('/dashboard/recruiter/applications') },
      { id: 'sourcing', label: 'Go to Sourcing', keywords: 'source', icon: <Search className="w-4 h-4" />, run: () => router.push('/dashboard/recruiter/candidates?view=sourcing') },
      { id: 'post-job', label: 'Post new job', keywords: 'create job', icon: <Plus className="w-4 h-4" />, run: () => router.push('/dashboard/recruiter/jobs/new') },
      { id: 'screen', label: 'Screen new applications', keywords: 'unreviewed', icon: <ClipboardList className="w-4 h-4" />, run: () => router.push('/dashboard/recruiter/applications?filter=unreviewed') },
      { id: 'shortcuts', label: 'Show keyboard shortcuts', keywords: 'help ?', icon: <HelpCircle className="w-4 h-4" />, run: () => { onClose(); onShowShortcuts?.(); } },
    ],
    [router, onClose, onShowShortcuts]
  );

  const actions = customActions ?? defaultActions;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return actions;
    return actions.filter(
      (a) =>
        a.label.toLowerCase().includes(q) ||
        (a.keywords && a.keywords.toLowerCase().includes(q))
    );
  }, [actions, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelectedIndex(0);
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % Math.max(1, filtered.length));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => (i - 1 + filtered.length) % Math.max(1, filtered.length));
      } else if (e.key === 'Enter' && filtered[selectedIndex]) {
        e.preventDefault();
        filtered[selectedIndex].run();
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, filtered, selectedIndex, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] p-4 bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-surface-100 border border-surface-600 rounded-xl shadow-xl w-full max-w-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 border-b border-surface-700">
          <Search className="w-4 h-4 text-surface-500 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search actions..."
            className="flex-1 py-3 bg-transparent text-white placeholder-surface-500 outline-none"
            aria-label="Search commands"
          />
          <kbd className="hidden sm:inline px-2 py-1 text-xs text-surface-500 rounded bg-surface-700">Esc</kbd>
        </div>
        <div ref={listRef} className="max-h-72 overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <p className="px-4 py-6 text-center text-surface-500 text-sm">No actions match.</p>
          ) : (
            filtered.map((action, i) => (
              <button
                key={action.id}
                type="button"
                onClick={() => {
                  action.run();
                  onClose();
                }}
                onMouseEnter={() => setSelectedIndex(i)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                  i === selectedIndex ? 'bg-brand-500/20 text-brand-200' : 'text-surface-300 hover:bg-surface-200/50'
                }`}
              >
                {action.icon && (
                  <span className="text-surface-500 shrink-0">{action.icon}</span>
                )}
                <span className="font-medium">{action.label}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
