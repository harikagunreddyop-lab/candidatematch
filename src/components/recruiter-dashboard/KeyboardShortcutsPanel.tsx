'use client';

import { RECRUITER_SHORTCUTS } from './useKeyboardShortcuts';

export function KeyboardShortcutsPanel({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div
        className="bg-surface-100 border border-surface-600 rounded-xl shadow-xl max-w-md w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-white mb-4">Keyboard Shortcuts</h2>
        <ul className="space-y-2">
          {Object.entries(RECRUITER_SHORTCUTS).map(([key, value]) => (
            <li key={key} className="flex items-center justify-between gap-4 text-sm">
              <kbd className="px-2 py-1 rounded bg-surface-700 text-surface-300 font-mono text-xs">
                {key === 'g d' ? 'g then d' : key === 'g p' ? 'g then p' : key === 'g c' ? 'g then c' : key === 'g j' ? 'g then j' : key === 'g a' ? 'g then a' : key === 'g s' ? 'g then s' : key}
              </kbd>
              <span className="text-surface-400">
                {'path' in value ? value.label : value.label}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-surface-500 mt-4">
          Press <kbd className="px-1 rounded bg-surface-700">?</kbd> or <kbd className="px-1 rounded bg-surface-700">Ctrl+K</kbd> to toggle this panel.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full py-2 rounded-lg bg-surface-600 hover:bg-surface-500 text-white text-sm font-medium"
        >
          Close
        </button>
      </div>
    </div>
  );
}
