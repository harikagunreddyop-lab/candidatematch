'use client';

import { cn } from '@/utils/helpers';

export interface TeamMemberPerf {
  recruiter_id: string;
  name: string | null;
  email: string | null;
  total_candidates: number;
  total_applications: number;
  interviews_secured: number;
  offers_received: number;
  hires_completed: number;
  avg_time_to_interview?: number | null;
  quality_score?: number | null;
}

interface TeamPerformanceTableProps {
  team: TeamMemberPerf[];
  loading?: boolean;
  className?: string;
}

export function TeamPerformanceTable({ team, loading, className }: TeamPerformanceTableProps) {
  if (loading) {
    return (
      <div className={cn('rounded-2xl border border-surface-700/60 bg-surface-800/50 p-6', className)}>
        <div className="h-48 animate-pulse bg-surface-700 rounded-lg" />
      </div>
    );
  }

  if (team.length === 0) {
    return (
      <div className={cn('rounded-2xl border border-surface-700/60 bg-surface-800/50 p-6', className)}>
        <h2 className="text-lg font-semibold text-white mb-4">Team Performance</h2>
        <p className="text-surface-500 text-sm">No team data yet.</p>
      </div>
    );
  }

  return (
    <div className={cn('rounded-2xl border border-surface-700/60 bg-surface-800/50 p-6 overflow-x-auto', className)}>
      <h2 className="text-lg font-semibold text-white mb-4">Team Performance</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-surface-700 text-left text-surface-400">
            <th className="pb-3 pr-4 font-medium">Member</th>
            <th className="pb-3 pr-4 font-medium text-right">Candidates</th>
            <th className="pb-3 pr-4 font-medium text-right">Applications</th>
            <th className="pb-3 pr-4 font-medium text-right">Interviews</th>
            <th className="pb-3 pr-4 font-medium text-right">Offers</th>
            <th className="pb-3 font-medium text-right">Hires</th>
          </tr>
        </thead>
        <tbody>
          {team.map((m) => (
            <tr key={m.recruiter_id} className="border-b border-surface-700/60">
              <td className="py-3 pr-4">
                <div className="font-medium text-white">{m.name || m.email || 'Unknown'}</div>
                {m.email && <div className="text-xs text-surface-500">{m.email}</div>}
              </td>
              <td className="py-3 pr-4 text-right text-surface-300">{m.total_candidates}</td>
              <td className="py-3 pr-4 text-right text-surface-300">{m.total_applications}</td>
              <td className="py-3 pr-4 text-right text-surface-300">{m.interviews_secured}</td>
              <td className="py-3 pr-4 text-right text-surface-300">{m.offers_received}</td>
              <td className="py-3 text-right font-medium text-white">{m.hires_completed}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
