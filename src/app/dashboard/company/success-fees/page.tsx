'use client';

import { DollarSign, CheckCircle, Clock } from 'lucide-react';

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: 'amber' | 'emerald' | 'violet';
}) {
  const colorClasses = {
    amber: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
    emerald: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
    violet: 'bg-brand-400/10 border-brand-400/20 text-brand-400',
  };
  const c = colorClasses[color];
  return (
    <div className={`rounded-xl border p-6 ${c}`}>
      <div className="flex items-center gap-3 mb-2">
        <span className="opacity-90">{icon}</span>
        <span className="text-sm font-medium opacity-90">{label}</span>
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
    </div>
  );
}

export default function SuccessFeesPage() {
  const pending = '$15,000';
  const paid = '$45,000';
  const total = '$60,000';

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-white mb-6">Success Fee Tracking</h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
        <StatCard label="Pending" value={pending} icon={<Clock className="w-5 h-5" />} color="amber" />
        <StatCard label="Paid" value={paid} icon={<CheckCircle className="w-5 h-5" />} color="emerald" />
        <StatCard label="Total" value={total} icon={<DollarSign className="w-5 h-5" />} color="violet" />
      </div>

      {/* Fee table */}
      <div className="bg-surface-800 rounded-xl border border-surface-700/60 overflow-hidden">
        <table className="w-full">
          <thead className="bg-surface-900/50 border-b border-surface-700">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-surface-400 uppercase tracking-wider">
                Candidate
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-surface-400 uppercase tracking-wider">
                Job
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-surface-400 uppercase tracking-wider">
                Fee
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-surface-400 uppercase tracking-wider">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-surface-400 uppercase tracking-wider">
                Due Date
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-700">
            <tr className="hover:bg-surface-800/80">
              <td className="px-4 py-3 text-sm text-white">—</td>
              <td className="px-4 py-3 text-sm text-surface-400">—</td>
              <td className="px-4 py-3 text-sm text-surface-400">—</td>
              <td className="px-4 py-3 text-sm text-surface-400">—</td>
              <td className="px-4 py-3 text-sm text-surface-400">—</td>
            </tr>
          </tbody>
        </table>
        <div className="px-4 py-6 text-center text-surface-500 text-sm">
          Fee records will appear here when placements are tracked.
        </div>
      </div>
    </div>
  );
}
