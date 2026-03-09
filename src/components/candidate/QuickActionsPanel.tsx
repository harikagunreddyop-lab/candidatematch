'use client';

import Link from 'next/link';
import {
  Briefcase,
  Sparkles,
  ClipboardList,
  Settings,
  FileText,
} from 'lucide-react';
import { cn } from '@/utils/helpers';
import { Skeleton } from '@/components/ui';

export interface QuickActionItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  ariaLabel?: string;
}

const DEFAULT_ACTIONS: QuickActionItem[] = [
  { label: 'Browse Jobs', href: '/dashboard/candidate/jobs', icon: <Briefcase className="w-5 h-5" />, ariaLabel: 'Browse jobs' },
  { label: 'My Matches', href: '/dashboard/candidate/matches', icon: <Sparkles className="w-5 h-5" />, ariaLabel: 'View AI matches' },
  { label: 'Applications', href: '/dashboard/candidate/applications', icon: <ClipboardList className="w-5 h-5" />, ariaLabel: 'View applications' },
  { label: 'Resumes', href: '/dashboard/candidate/resumes', icon: <FileText className="w-5 h-5" />, ariaLabel: 'Manage resumes' },
  { label: 'Settings', href: '/dashboard/candidate/settings', icon: <Settings className="w-5 h-5" />, ariaLabel: 'Settings' },
];

export interface QuickActionsPanelProps {
  actions?: QuickActionItem[];
  loading?: boolean;
  className?: string;
  onActionClick?: (label: string, href: string) => void;
}

export function QuickActionsPanel({
  actions = DEFAULT_ACTIONS,
  loading,
  className,
  onActionClick,
}: QuickActionsPanelProps) {
  if (loading) {
    return (
      <div className={cn('grid grid-cols-2 sm:grid-cols-3 gap-2', className)}>
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-14 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <nav
      className={cn('grid grid-cols-2 sm:grid-cols-3 gap-2', className)}
      aria-label="Quick actions"
    >
      {actions.map((action) => (
        <Link
          key={action.href}
          href={action.href}
          onClick={() => onActionClick?.(action.label, action.href)}
          className={cn(
            'flex items-center gap-3 p-3 rounded-xl border border-surface-700/60 bg-surface-800',
            'hover:border-brand-400/50 hover:bg-surface-800/80 transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-900'
          )}
          aria-label={action.ariaLabel ?? action.label}
        >
          <span className="text-brand-400 shrink-0">{action.icon}</span>
          <span className="text-sm font-medium text-white truncate">{action.label}</span>
        </Link>
      ))}
    </nav>
  );
}
