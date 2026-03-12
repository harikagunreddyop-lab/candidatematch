'use client';

import { useState } from 'react';

type FloatingInputProps = {
  icon: React.ReactNode;
  type?: string;
  placeholder: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  required?: boolean;
  autoComplete?: string;
  minLength?: number;
  disabled?: boolean;
};

export function FloatingInput({
  icon,
  type = 'text',
  placeholder,
  value,
  onChange,
  onFocus,
  onBlur,
  required,
  autoComplete,
  minLength,
  disabled,
}: FloatingInputProps) {
  const [focused, setFocused] = useState(false);

  return (
    <div className="relative">
      <div
        className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors ${
          focused ? 'text-white' : 'text-surface-500'
        }`}
      >
        {icon}
      </div>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        onFocus={() => {
          setFocused(true);
          onFocus?.();
        }}
        onBlur={() => {
          setFocused(false);
          onBlur?.();
        }}
        required={required}
        autoComplete={autoComplete}
        minLength={minLength}
        disabled={disabled}
        className={`w-full pl-12 pr-4 py-3 bg-black/50 border rounded-xl text-white font-medium placeholder-surface-500 transition-all focus:outline-none focus:ring-2 focus:ring-white/70 ${
          focused ? 'border-white shadow-elevated' : 'border-surface-700'
        }`}
      />
    </div>
  );
}
