'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/utils/helpers';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-bg)] disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary:
          'bg-brand-400 text-[#0a0f00] font-bold hover:bg-brand-300 focus-visible:ring-brand-400 shadow-lime hover:shadow-lime-lg transition-shadow',
        secondary:
          'bg-surface-200 text-surface-900 hover:bg-surface-300 border border-surface-300 hover:border-surface-400 focus-visible:ring-brand-400',
        outline:
          'border border-surface-300 bg-transparent text-surface-800 hover:bg-surface-100 hover:border-brand-400 hover:text-brand-400 focus-visible:ring-brand-400',
        ghost:
          'text-surface-800 hover:bg-surface-50 focus-visible:ring-brand-400',
        danger:
          'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500',
      },
      size: {
        sm: 'h-8 px-3 text-sm',
        md: 'h-10 px-4 text-base',
        lg: 'h-12 px-6 text-lg',
        xl: 'h-14 px-8 text-xl',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export function Button({
  className,
  variant,
  size,
  loading,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={loading ?? disabled}
      aria-busy={loading}
      {...props}
    >
      {loading && (
        <span
          className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"
          aria-hidden
        />
      )}
      {children}
    </button>
  );
}
