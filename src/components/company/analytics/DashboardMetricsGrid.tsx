'use client';

import Link from 'next/link';
import {
  Briefcase,
  Users,
  TrendingUp,
  Target,
  Clock,
  Star,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@/utils/helpers';
import type { DashboardMetrics } from './types';

const CARDS: {
  key: keyof DashboardMetrics;
  label: string;
  href: string;
  icon: React.ReactNode;
  color: string;
  format?: (v: number | null) => string;
}[] = [
  { key: 'total_active_jobs', label: 'Active Jobs', href: '/dashboard/company/jobs', icon: <Briefcase className="w-5 h-5" />, color: 'from-brand-400 to-brand-600' },
  { key: 'total_applications', label: 'Applications', href: '/dashboard/company/candidates', icon: <Users className="w-5 h-5" />, color: 'from-brand-500 to-brand-700' },
  { key: 'applications_in_interview', label: 'In Interview', href: '/dashboard/company/pipeline', icon: <TrendingUp className="w-5 h-5" />, color: 'from-emerald-500 to-teal-600' },
  { key: 'hires_completed', label: 'Hires', href: '/dashboard/company/pipeline', icon: <Target className="w-5 h-5" />, color: 'from-amber-500 to-orange-600' },
  { key: 'avg_time_to_hire_days', label: 'Avg Time to Hire', href: '/dashboard/company/analytics', icon: <Clock className="w-5 h-5" />, color: 'from-violet-500 to-purple-600', format: (v) => (v != null ? `${Math.round(v)} days` : '—') },
  { key: 'avg_quality_of_hire_score', label: 'Quality Score', href: '/dashboard/company/analytics', icon: <Star className="w-5 h-5" />, color: 'from-rose-500 to-pink-600', format: (v) => (v != null ? `${Math.round(v)}/100` : '—') },
];

interface DashboardMetricsGridProps {
  metrics: DashboardMetrics | null;
  loading?: boolean;
}

export function DashboardMetricsGrid({ metrics, loading }: DashboardMetricsGridProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {CARDS.map((c) => (
          <div key={c.key} className="rounded-xl border border-surface-700/60 bg-surface-800/50 p-5 animate-pulse">
            <div className="h-5 w-10 bg-surface-700 rounded mb-3" />
            <div className="h-8 w-16 bg-surface-700 rounded" />
            <div className="h-4 w-20 bg-surface-700 rounded mt-2" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      {CARDS.map(({ key, label, href, icon, color, format }) => {
        const raw = metrics?.[key];
        const value = typeof raw === 'number' && format ? format(raw) : raw ?? 0;
        return (
          <Link key={key} href={href} className="group">
            <div className={cn('rounded-xl transition-all hover:scale-[1.02] bg-gradient-to-br p-[1px]', color)}>
              <div className="rounded-xl bg-surface-900 p-5">
                <div className="flex items-center justify-between mb-2">
                  <div className={cn('p-2 rounded-lg bg-opacity-20', color)}>{icon}</div>
                  <ArrowRight className="w-4 h-4 text-surface-500 group-hover:text-brand-400 transition-colors" />
                </div>
                <div className="text-2xl font-bold text-white">{value}</div>
                <div className="text-sm text-surface-400 mt-0.5">{label}</div>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
