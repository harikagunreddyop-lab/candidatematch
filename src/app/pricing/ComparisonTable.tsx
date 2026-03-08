'use client';

import { useState } from 'react';
import Link from 'next/link';

const FEATURES_COMPARISON = [
  { feature: 'Job applications per month', free: '5', pro: 'Unlimited', proPlus: 'Unlimited' },
  { feature: 'Basic resume builder', free: '✓', pro: '✓', proPlus: '✓' },
  { feature: 'AI-powered resume', free: '—', pro: '✓', proPlus: '✓' },
  { feature: 'Email tracking & auto-updates', free: '—', pro: '✓', proPlus: '✓' },
  { feature: 'ATS scoring & optimization', free: '—', pro: '✓', proPlus: '✓' },
  { feature: 'Job alerts', free: '0', pro: '10', proPlus: 'Unlimited' },
  { feature: 'Priority matching', free: '—', pro: '—', proPlus: '✓' },
  { feature: 'Analytics dashboard', free: '—', pro: '—', proPlus: '✓' },
  { feature: 'Career coaching', free: '—', pro: '—', proPlus: '✓' },
  { feature: 'Interview prep', free: '—', pro: '—', proPlus: '✓' },
  { feature: 'Support', free: 'Community', pro: 'Priority', proPlus: 'White-glove' },
];

export function ComparisonTable() {
  return (
    <div className="overflow-x-auto rounded-xl border border-white/10">
      <table className="w-full min-w-[600px] text-sm">
        <thead>
          <tr className="border-b border-white/10">
            <th className="text-left py-4 px-4 font-semibold text-white">Feature</th>
            <th className="text-center py-4 px-4 font-semibold text-neutral-400">Free</th>
            <th className="text-center py-4 px-4 font-semibold text-blue-400">Pro</th>
            <th className="text-center py-4 px-4 font-semibold text-violet-400">Pro Plus</th>
          </tr>
        </thead>
        <tbody>
          {FEATURES_COMPARISON.map((row, i) => (
            <tr key={i} className="border-b border-white/5 hover:bg-white/[0.02]">
              <td className="py-3 px-4 text-neutral-300">{row.feature}</td>
              <td className="py-3 px-4 text-center text-neutral-500">{row.free}</td>
              <td className="py-3 px-4 text-center text-neutral-300">{row.pro}</td>
              <td className="py-3 px-4 text-center text-neutral-300">{row.proPlus}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
