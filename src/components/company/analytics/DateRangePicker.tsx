'use client';

import { cn } from '@/utils/helpers';
import type { DateRangePreset } from './types';

interface DateRangePickerProps {
  value: DateRangePreset;
  onChange: (value: DateRangePreset) => void;
  className?: string;
}

const OPTIONS: { value: DateRangePreset; label: string }[] = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
];

export function DateRangePicker({ value, onChange, className }: DateRangePickerProps) {
  return (
    <div className={cn('flex rounded-lg border border-surface-700 bg-surface-800/50 p-0.5', className)}>
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
            value === opt.value
              ? 'bg-brand-500 text-[#0a0f00]'
              : 'text-surface-400 hover:text-white hover:bg-surface-700'
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
