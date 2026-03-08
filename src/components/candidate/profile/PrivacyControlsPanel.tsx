'use client';

import { useCallback, useMemo } from 'react';
import { Shield, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/utils/helpers';

export interface PrivacySettings {
  show_email?: boolean;
  show_phone?: boolean;
  show_salary?: boolean;
  show_linkedin?: boolean;
}

export interface PrivacyControlsPanelProps {
  settings: PrivacySettings;
  onChange: (settings: PrivacySettings) => void;
  disabled?: boolean;
  className?: string;
}

const DEFAULTS: PrivacySettings = {
  show_email: true,
  show_phone: true,
  show_salary: true,
  show_linkedin: true,
};

const TOGGLES: { key: keyof PrivacySettings; label: string }[] = [
  { key: 'show_email', label: 'Show email to recruiters' },
  { key: 'show_phone', label: 'Show phone to recruiters' },
  { key: 'show_salary', label: 'Show salary range to recruiters' },
  { key: 'show_linkedin', label: 'Show LinkedIn URL' },
];

export function PrivacyControlsPanel({
  settings,
  onChange,
  disabled,
  className,
}: PrivacyControlsPanelProps) {
  const effective = useMemo(() => ({ ...DEFAULTS, ...settings }), [settings]);

  const handleToggle = useCallback(
    (key: keyof PrivacySettings) => {
      if (disabled) return;
      onChange({ ...effective, [key]: !effective[key] });
    },
    [disabled, effective, onChange]
  );

  return (
    <div
      className={cn('rounded-2xl border border-surface-200 dark:border-surface-700 bg-surface-100 dark:bg-surface-800 p-6', className)}
      role="region"
      aria-label="Privacy controls"
    >
      <div className="flex items-center gap-2 mb-4">
        <Shield className="w-5 h-5 text-surface-500 dark:text-surface-400" />
        <h3 className="text-sm font-bold text-surface-900 dark:text-surface-100">Privacy</h3>
      </div>
      <p className="text-xs text-surface-500 dark:text-surface-400 mb-4">
        Choose what recruiters can see when viewing your profile.
      </p>
      <ul className="space-y-3">
        {TOGGLES.map(({ key, label }) => (
          <li key={key}>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={effective[key] !== false}
                onChange={() => handleToggle(key)}
                disabled={disabled}
                className="rounded border-surface-300 dark:border-surface-600 text-brand-600 focus:ring-brand-500"
              />
              <span className="text-sm text-surface-700 dark:text-surface-200">{label}</span>
              {effective[key] !== false ? (
                <Eye className="w-4 h-4 text-surface-400 shrink-0" aria-hidden />
              ) : (
                <EyeOff className="w-4 h-4 text-surface-400 shrink-0" aria-hidden />
              )}
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
