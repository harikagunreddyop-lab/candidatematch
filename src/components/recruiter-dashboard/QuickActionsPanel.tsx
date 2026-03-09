'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ClipboardList,
  Calendar,
  Mail,
  Briefcase,
  Search,
  BarChart3,
  Sparkles,
  ChevronRight,
} from 'lucide-react';
import type { QuickActionCounts } from '@/types/recruiter-dashboard';

const ACTIONS: {
  key: keyof QuickActionCounts;
  label: string;
  icon: React.ReactNode;
  href: string;
  countKey?: keyof QuickActionCounts;
}[] = [
  {
    key: 'unreviewed_applications',
    label: 'Screen New Applications',
    icon: <ClipboardList className="w-4 h-4" />,
    href: '/dashboard/recruiter/applications?filter=unreviewed',
    countKey: 'unreviewed_applications',
  },
  {
    key: 'interviews_to_schedule',
    label: 'Schedule Interviews',
    icon: <Calendar className="w-4 h-4" />,
    href: '/dashboard/recruiter/applications?status=interview',
    countKey: 'interviews_to_schedule',
  },
  {
    key: 'follow_ups_due',
    label: 'Send Follow-ups',
    icon: <Mail className="w-4 h-4" />,
    href: '/dashboard/recruiter/applications',
    countKey: 'follow_ups_due',
  },
  {
    key: 'pending_offers',
    label: 'Review Offers',
    icon: <Briefcase className="w-4 h-4" />,
    href: '/dashboard/recruiter/applications?status=offer',
    countKey: 'pending_offers',
  },
  {
    key: 'unreviewed_applications',
    label: 'Source Candidates',
    icon: <Search className="w-4 h-4" />,
    href: '/dashboard/recruiter/sourcing',
  },
  {
    key: 'unreviewed_applications',
    label: 'Update Pipeline',
    icon: <BarChart3 className="w-4 h-4" />,
    href: '/dashboard/recruiter/pipeline',
  },
];

function isQuickActionCounts(value: unknown): value is QuickActionCounts {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<QuickActionCounts>;
  return (
    typeof v.unreviewed_applications === 'number' &&
    typeof v.interviews_to_schedule === 'number' &&
    typeof v.follow_ups_due === 'number' &&
    typeof v.pending_offers === 'number'
  );
}

export function QuickActionsPanel() {
  const [counts, setCounts] = useState<QuickActionCounts | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/recruiter/dashboard/counts')
      .then(async (r) => {
        if (!r.ok) return null;
        const data = await r.json();
        return isQuickActionCounts(data?.counts) ? data.counts : null;
      })
      .then((safeCounts) => {
        setCounts(safeCounts);
      })
      .catch(() => setCounts(null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="bg-surface-100 border border-surface-700/60 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-brand-400" />
        Quick Actions
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {ACTIONS.map((action) => {
          const count = action.countKey && counts ? counts[action.countKey] : 0;
          return (
            <Link
              key={action.label}
              href={action.href}
              className="flex items-center justify-between gap-2 p-3 rounded-lg bg-surface-200/50 hover:bg-surface-200 border border-surface-600/50 hover:border-surface-500 transition-colors group"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-surface-400 group-hover:text-brand-400 shrink-0">
                  {action.icon}
                </span>
                <span className="text-sm font-medium text-white truncate">
                  {action.label}
                </span>
              </div>
              {typeof count === 'number' && count > 0 && (
                <span className="shrink-0 flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-brand-500/20 text-brand-300 text-xs font-semibold">
                  {count}
                </span>
              )}
              <ChevronRight className="w-4 h-4 text-surface-500 shrink-0 opacity-0 group-hover:opacity-100" />
            </Link>
          );
        })}
      </div>
      {loading && (
        <div className="mt-2 h-8 animate-pulse bg-surface-200 rounded" />
      )}
    </div>
  );
}
