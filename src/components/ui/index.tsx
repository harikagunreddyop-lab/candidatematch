'use client';
import { cn, statusColor, fitScoreColor } from '@/utils/helpers';
import { X, Check, AlertCircle, Info, Loader2 } from 'lucide-react';

// ─── Modal ───────────────────────────────────────────────────────────────────
export function Modal({ open, onClose, title, children, size = 'md' }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  if (!open) return null;
  const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
      <div className={cn('relative bg-white dark:bg-surface-800 rounded-2xl shadow-modal w-full max-w-[95vw] p-6 animate-slide-up border border-surface-200 dark:border-surface-600', widths[size])}
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-surface-900 dark:text-surface-100 font-display">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-700 text-surface-400 dark:text-surface-300 hover:text-surface-600 dark:hover:text-surface-100 transition-colors">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Toast Container ─────────────────────────────────────────────────────────
export function ToastContainer({ toasts, dismiss }: {
  toasts: { id: string; message: string; type: 'success' | 'error' | 'info' }[];
  dismiss: (id: string) => void;
}) {
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map(t => (
        <div key={t.id} className={cn(
          'flex items-center gap-3 px-4 py-3 rounded-xl shadow-elevated border animate-slide-in-right',
          t.type === 'success' && 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-500/40 text-green-800 dark:text-green-200',
          t.type === 'error' && 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-500/40 text-red-800 dark:text-red-200',
          t.type === 'info' && 'bg-brand-50 dark:bg-brand-500/20 border-brand-200 dark:border-brand-500/40 text-brand-800 dark:text-brand-200',
        )}>
          {t.type === 'success' && <Check size={16} />}
          {t.type === 'error' && <AlertCircle size={16} />}
          {t.type === 'info' && <Info size={16} />}
          <span className="text-sm font-medium flex-1">{t.message}</span>
          <button onClick={() => dismiss(t.id)} className="p-0.5 hover:opacity-70"><X size={14} /></button>
        </div>
      ))}
    </div>
  );
}

// ─── Loading Spinner ─────────────────────────────────────────────────────────
export function Spinner({ size = 20, className = '' }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={cn('animate-spin text-brand-500', className)} />;
}

export function PageLoader() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="flex flex-col items-center gap-3">
        <Spinner size={32} />
        <p className="text-sm text-surface-500 dark:text-surface-300">Loading...</p>
      </div>
    </div>
  );
}

// ─── Empty State ─────────────────────────────────────────────────────────────
export function EmptyState({ icon, title, description, action }: {
  icon: React.ReactNode; title: string; description: string; action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-14 h-14 rounded-2xl bg-surface-100 dark:bg-surface-700 flex items-center justify-center text-surface-400 dark:text-surface-300 mb-4">
        {icon}
      </div>
      <h3 className="text-base font-semibold text-surface-800 dark:text-surface-100 mb-1">{title}</h3>
      <p className="text-sm text-surface-500 dark:text-surface-300 max-w-sm mb-5">{description}</p>
      {action}
    </div>
  );
}

// ─── Stat Card ───────────────────────────────────────────────────────────────
export function StatCard({ label, value, icon, trend }: {
  label: string; value: string | number; icon: React.ReactNode; trend?: string;
}) {
  return (
    <div className="stat-card">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-surface-500 dark:text-surface-300">{label}</span>
        <div className="w-9 h-9 rounded-xl bg-brand-50 dark:bg-brand-500/20 flex items-center justify-center text-brand-500 dark:text-brand-400">{icon}</div>
      </div>
      <div className="text-2xl font-bold text-surface-900 dark:text-surface-100 font-display">{value}</div>
      {trend && <p className="text-xs text-surface-500 dark:text-surface-300 mt-1">{trend}</p>}
    </div>
  );
}

// ─── Status Badge ────────────────────────────────────────────────────────────
export function StatusBadge({ status }: { status: string }) {
  return <span className={statusColor(status)}>{status}</span>;
}

// ─── Fit Score ───────────────────────────────────────────────────────────────
export function FitScore({ score }: { score: number }) {
  return <span className={fitScoreColor(score)}>{score}%</span>;
}

// ─── Tabs ────────────────────────────────────────────────────────────────────
export function Tabs({ tabs, active, onChange }: {
  tabs: { key: string; label: string; count?: number }[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="flex gap-1 border-b border-surface-200 dark:border-surface-600">
      {tabs.map(tab => (
        <button key={tab.key}
          onClick={() => onChange(tab.key)}
          className={cn('px-4 py-2.5 text-sm transition-all -mb-px', active === tab.key ? 'tab-active' : 'tab-inactive')}>
          {tab.label}
          {tab.count !== undefined && (
            <span className="ml-1.5 text-xs bg-surface-100 dark:bg-surface-600 text-surface-500 dark:text-surface-200 px-1.5 py-0.5 rounded-full">{tab.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

// ─── Confirm Dialog ──────────────────────────────────────────────────────────
export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmText = 'Confirm', danger = false }: {
  open: boolean; onClose: () => void; onConfirm: () => void; title: string; message: string;
  confirmText?: string; danger?: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <p className="text-sm text-surface-600 dark:text-surface-200 mb-5">{message}</p>
      <div className="flex gap-3 justify-end">
        <button onClick={onClose} className="btn-secondary text-sm">Cancel</button>
        <button onClick={() => { onConfirm(); onClose(); }}
          className={cn('text-sm', danger ? 'btn-danger' : 'btn-primary')}>{confirmText}</button>
      </div>
    </Modal>
  );
}

// ─── Search Input ────────────────────────────────────────────────────────────
export function SearchInput({ value, onChange, placeholder = 'Search...', className }: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string;
}) {
  return (
    <div className={className ? `relative ${className}` : 'relative'}>
      <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 text-surface-400 dark:text-surface-400 pointer-events-none" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      <input type="text" value={value} onChange={e => onChange(e.target.value)}
        className="input pl-10 text-sm dark:bg-surface-700 dark:border-surface-600 dark:text-surface-100 dark:placeholder:text-surface-400" placeholder={placeholder} />
    </div>
  );
}
