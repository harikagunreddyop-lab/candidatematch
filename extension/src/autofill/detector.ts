import { FIELD_PATTERNS, ProfileKey } from './ats-patterns';

export interface DetectedField {
  el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  label: string;
  name: string;
  id: string;
  type: string;
  required: boolean;
  options: string[];
  selector: string;
  snippet: string;
  fingerprint: string;
}

// djb2 hash — fast, stable, no deps
function djb2(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) h = (h * 33) ^ s.charCodeAt(i);
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function makeFingerprint(
  label: string,
  name: string,
  id: string,
  type: string,
  options: string[]
): string {
  return djb2([label, name, id, type, options.join(',')].join('|').toLowerCase());
}

function normalize(s: string): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Label resolution: walks up the DOM and sideways for label text
export function resolveLabel(el: HTMLElement): string {
  // 1. <label for="id">
  if (el.id) {
    const lbl = document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(el.id)}"]`);
    if (lbl) return normalize(lbl.textContent || '');
  }

  // 2. aria-label / aria-labelledby
  const aria = el.getAttribute('aria-label');
  if (aria) return normalize(aria);
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const parts = labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent || '');
    const text = parts.join(' ').trim();
    if (text) return normalize(text);
  }

  // 3. Workday: data-automation-id based label sibling
  const autoId = el.getAttribute('data-automation-id');
  if (autoId) {
    const parent = el.closest('[data-automation-id]')?.parentElement;
    const lbl = parent?.querySelector('label, [data-automation-id*="label"]');
    if (lbl) return normalize(lbl.textContent || '');
    void autoId;
  }

  // 4. Walk up DOM for wrapping label or .field-label, .form-label, etc.
  const parent = el.closest(
    'label, [class*="field"], [class*="form-group"], [class*="form-item"], [class*="input-group"], [class*="question"]'
  );
  if (parent) {
    const lbl = parent.querySelector('label, [class*="label"], legend, [class*="title"], [class*="heading"]');
    if (lbl && lbl !== el) return normalize(lbl.textContent || '');
  }

  // 5. Previous sibling label/span/p
  let prev = el.previousElementSibling;
  while (prev) {
    const tag = prev.tagName.toLowerCase();
    if (['label', 'span', 'p', 'div', 'legend', 'h1', 'h2', 'h3', 'h4', 'h5'].includes(tag)) {
      const text = normalize(prev.textContent || '');
      if (text.length > 1 && text.length < 120) return text;
    }
    prev = prev.previousElementSibling;
  }

  // 6. Placeholder as fallback
  return normalize((el as HTMLInputElement).placeholder || '');
}

function getSnippet(el: HTMLElement): string {
  const parent = el.parentElement;
  if (!parent) return '';
  return (parent.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 200);
}

function getCssSelector(el: HTMLElement): string {
  if (el.id) return `#${CSS.escape(el.id)}`;
  const tag = el.tagName.toLowerCase();
  const name = (el as HTMLInputElement).name;
  if (name) return `${tag}[name="${CSS.escape(name)}"]`;
  return tag;
}

function getOptions(el: HTMLSelectElement | HTMLInputElement): string[] {
  if (el.tagName.toLowerCase() === 'select') {
    return Array.from((el as HTMLSelectElement).options).map((o) => normalize(o.text));
  }
  if ((el as HTMLInputElement).type === 'radio') {
    const name = (el as HTMLInputElement).name;
    if (!name) return [];
    return Array.from(
      document.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${CSS.escape(name)}"]`)
    ).map((r) => normalize(r.value || resolveLabel(r)));
  }
  return [];
}

// SAFETY: never touch these
const SKIP_TYPES = new Set(['hidden', 'submit', 'button', 'reset', 'image', 'file', 'password']);
const SKIP_NAME_PATTERNS = /captcha|token|csrf|_token|recaptcha|honeypot|bot_check/i;

// Main detector
export function detectFields(): DetectedField[] {
  const seen = new Set<string>();
  const fields: DetectedField[] = [];

  const inputs = Array.from(
    document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea')
  );

  for (const el of inputs) {
    const type =
      el instanceof HTMLInputElement
        ? (el.type || 'text').toLowerCase()
        : el instanceof HTMLSelectElement
        ? 'select'
        : 'textarea';

    // Skip unsafe/irrelevant types
    if (SKIP_TYPES.has(type)) continue;
    if (SKIP_NAME_PATTERNS.test(el.name || '')) continue;

    // Skip invisible
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || rect.width === 0) continue;

    // Skip radio duplicates (only register once per name)
    if (type === 'radio') {
      const key = `radio::${el.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
    }

    const label = resolveLabel(el);
    const name = normalize(el.name || '');
    const id = normalize(el.id || '');
    const options = type === 'select' || type === 'radio' ? getOptions(el as any) : [];

    const fp = makeFingerprint(label, name, id, type, options);
    if (seen.has(fp)) continue;
    seen.add(fp);

    fields.push({
      el,
      label,
      name,
      id,
      type,
      required: !!(el as HTMLInputElement).required,
      options,
      selector: getCssSelector(el),
      snippet: getSnippet(el),
      fingerprint: fp,
    });
  }

  return fields;
}

// Heuristic classifier
export function classifyField(
  field: DetectedField
): { key: ProfileKey; confidence: number } | null {
  const { name, id, label, type, options } = field;
  const ph = normalize((field.el as HTMLInputElement).placeholder || '');
  const autocomplete = normalize((field.el as HTMLInputElement).getAttribute('autocomplete') || '');
  const haystack = `${name} ${id} ${label} ${ph} ${autocomplete}`;
  const optStr = options.join(' ');

  void haystack;

  for (const [profileKey, patterns] of Object.entries(FIELD_PATTERNS) as [
    ProfileKey,
    (typeof FIELD_PATTERNS)[ProfileKey]
  ][]) {
    let confidence = 0;

    if (patterns.types?.includes(type)) confidence = Math.max(confidence, 95);
    if (patterns.autocomplete?.some((a) => autocomplete === a)) confidence = Math.max(confidence, 92);
    if (patterns.names.some((n) => name === n || id === n)) confidence = Math.max(confidence, 90);
    if (patterns.names.some((n) => name.includes(n) || id.includes(n))) confidence = Math.max(confidence, 80);
    if (patterns.labels.some((l) => label === l)) confidence = Math.max(confidence, 88);
    if (patterns.labels.some((l) => label.includes(l))) confidence = Math.max(confidence, 75);
    if (patterns.placeholders.some((p) => ph.includes(p))) confidence = Math.max(confidence, 70);
    if (options.length > 0 && patterns.labels.some((l) => optStr.includes(l))) confidence = Math.max(confidence, 65);

    if (confidence >= 60) return { key: profileKey, confidence };
  }

  return null;
}

