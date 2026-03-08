'use client';

import { formatDate } from '@/utils/helpers';
import { StatusBadge } from '@/components/ui';
import type { Application } from '@/types';

export function ApplicationsList({ applications }: { applications: Application[] }) {
  if (applications.length === 0) {
    return (
      <div className="bg-surface-800 rounded-xl p-8 text-center border border-surface-700/60">
        <p className="text-[#0a0a0a] font-medium">No applications yet. Start applying to jobs!</p>
      </div>
    );
  }

  return (
    <div className="bg-surface-800 rounded-xl border border-surface-700/60 overflow-hidden">
      <table className="w-full">
        <thead className="bg-surface-900/50 border-b border-surface-700">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold text-surface-400 uppercase">Job</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-surface-400 uppercase">Company</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-surface-400 uppercase">Status</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-surface-400 uppercase">Applied</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-700/50">
          {applications.map((app) => (
            <tr key={app.id} className="hover:bg-surface-900/30">
              <td className="px-4 py-3 text-[#0a0a0a] font-medium">{app.job?.title}</td>
              <td className="px-4 py-3 text-surface-400">{app.job?.company}</td>
              <td className="px-4 py-3">
                <StatusBadge status={app.status} />
              </td>
              <td className="px-4 py-3 text-surface-400 text-sm">
                {formatDate(app.applied_at ?? app.created_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
