'use client';

import { useState, useRef, useEffect } from 'react';
import { SKILL_SUGGESTIONS } from '@/lib/skill-ontology';
import { cn } from '@/utils/helpers';

const MAX_SUGGESTIONS = 8;

export interface SkillsAutocompleteProps {
  value: string[];
  onChange: (skills: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}

export function SkillsAutocomplete({
  value,
  onChange,
  placeholder = 'Add a skill...',
  disabled,
  className,
  'aria-label': ariaLabel,
}: SkillsAutocompleteProps) {
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const normalized = input.trim().toLowerCase();
  const suggestions = normalized.length >= 1
    ? SKILL_SUGGESTIONS.filter(
        (s) =>
          s.toLowerCase().includes(normalized) &&
          !value.map((v) => v.toLowerCase()).includes(s.toLowerCase())
      ).slice(0, MAX_SUGGESTIONS)
    : [];

  useEffect(() => {
    setHighlight(0);
  }, [suggestions.length]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const addSkill = (skill: string) => {
    const s = skill.trim();
    if (!s || value.map((v) => v.toLowerCase()).includes(s.toLowerCase())) return;
    onChange([...value, s]);
    setInput('');
    setOpen(false);
  };

  const removeSkill = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || suggestions.length === 0) {
      if (e.key === 'Enter' && input.trim()) {
        addSkill(input.trim());
        e.preventDefault();
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => (h + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      addSkill(suggestions[highlight]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <div className="flex flex-wrap gap-2 p-2 border border-surface-200 dark:border-surface-600 rounded-xl bg-white dark:bg-surface-800 min-h-[42px]">
        {value.map((s, i) => (
          <span
            key={`${s}-${i}`}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-brand-100 dark:bg-brand-500/20 text-brand-800 dark:text-brand-200 text-sm font-medium"
          >
            {s}
            {!disabled && (
              <button
                type="button"
                onClick={() => removeSkill(i)}
                className="hover:bg-brand-200 dark:hover:bg-brand-500/40 rounded p-0.5"
                aria-label={`Remove ${s}`}
              >
                ×
              </button>
            )}
          </span>
        ))}
        <input
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setOpen(true);
          }}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          onKeyDown={onKeyDown}
          disabled={disabled}
          placeholder={placeholder}
          aria-label={ariaLabel ?? 'Add skill'}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open && suggestions.length > 0}
          aria-controls="skills-suggestions-list"
          className="flex-1 min-w-[120px] bg-transparent border-0 outline-none text-sm text-surface-900 dark:text-surface-100 placeholder:text-surface-400"
        />
      </div>
      {open && suggestions.length > 0 && (
        <ul
          id="skills-suggestions-list"
          role="listbox"
          className="absolute z-10 mt-1 w-full rounded-lg border border-surface-200 dark:border-surface-600 bg-white dark:bg-surface-800 shadow-lg py-1 max-h-48 overflow-auto"
        >
          {suggestions.map((s, i) => (
            <li
              key={s}
              role="option"
              aria-selected={i === highlight}
              className={cn(
                'px-3 py-2 text-sm cursor-pointer',
                i === highlight
                  ? 'bg-brand-100 dark:bg-brand-500/30 text-brand-900 dark:text-brand-100'
                  : 'text-surface-700 dark:text-surface-200 hover:bg-surface-100 dark:hover:bg-surface-700'
              )}
              onMouseDown={(e) => {
                e.preventDefault();
                addSkill(s);
              }}
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
