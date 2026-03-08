'use client';

export function StatCard({ number, label }: { number: string; label: string }) {
  return (
    <div>
      <p className="text-2xl font-bold text-white tabular-nums">{number}</p>
      <p className="text-sm text-surface-400 mt-0.5">{label}</p>
    </div>
  );
}
