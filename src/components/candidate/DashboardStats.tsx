'use client';

import { Sparkles, Briefcase, ClipboardList, TrendingUp } from 'lucide-react';

interface Stats {
  matches: number;
  applications: number;
  interviews: number;
  averageScore: number;
}

export function DashboardStats({ stats }: { stats: Stats }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <StatCard
        label="AI Matches"
        value={stats.matches}
        icon={<Sparkles className="w-5 h-5" />}
        color="bg-violet-500/10 text-violet-400"
      />
      <StatCard
        label="Applications"
        value={stats.applications}
        icon={<ClipboardList className="w-5 h-5" />}
        color="bg-blue-500/10 text-blue-400"
      />
      <StatCard
        label="Interviews"
        value={stats.interviews}
        icon={<Briefcase className="w-5 h-5" />}
        color="bg-emerald-500/10 text-emerald-400"
      />
      <StatCard
        label="Avg Match Score"
        value={`${stats.averageScore}%`}
        icon={<TrendingUp className="w-5 h-5" />}
        color="bg-amber-500/10 text-amber-400"
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="bg-surface-800 rounded-xl p-6 border border-surface-700/60">
      <div className="flex items-center gap-3 mb-2">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>{icon}</div>
        <div>
          <p className="text-2xl font-bold text-white">{value}</p>
          <p className="text-xs text-surface-400 uppercase tracking-wide">{label}</p>
        </div>
      </div>
    </div>
  );
}
