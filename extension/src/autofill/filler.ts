import type { AutofillProfile } from '../api';
import type { DetectedField } from './detector';
import type { ProfileKey } from './ats-patterns';

export interface ResolvedMapping {
  field: DetectedField;
  profileKey: ProfileKey;
  confidence: number;
  source: 'saved' | 'heuristic' | 'unknown';
  value: string;
}

function normalize(s: string): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function profileValueToString(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return String(v);
}

// React / Angular / Vue synthetic event setter
function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (nativeSetter) {
    nativeSetter.call(el, value);
  } else {
    // eslint-disable-next-line no-param-reassign
    el.value = value;
  }
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new Event('blur', { bubbles: true }));
  el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
  el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
}

function fillSelect(el: HTMLSelectElement, value: string): boolean {
  const norm = normalize(value);
  const options = Array.from(el.options);

  let match = options.find((o) => normalize(o.value) === norm);
  if (!match) match = options.find((o) => normalize(o.text) === norm);
  if (!match) {
    match = options.find((o) => {
      const t = normalize(o.text);
      return t.includes(norm) || norm.includes(t);
    });
  }

  if (!match) {
    const isTrue = ['yes', 'true', '1', 'authorized', 'no sponsorship'].includes(norm);
    const isFalse = ['no', 'false', '0', 'unauthorized', 'requires sponsorship'].includes(norm);
    if (isTrue) {
      match = options.find((o) => ['yes', 'true', '1', 'authorized'].includes(normalize(o.text)));
    }
    if (!match && isFalse) {
      match = options.find((o) => ['no', 'false', '0'].includes(normalize(o.text)));
    }
  }

  if (match) {
    // eslint-disable-next-line no-param-reassign
    el.value = match.value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }
  return false;
}

function fillRadio(name: string, value: string, confidence: number): boolean {
  if (confidence < 80) return false;
  const norm = normalize(value);
  const radios = Array.from(
    document.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${CSS.escape(name)}"]`)
  );
  if (!radios.length) return false;

  const yesSet = new Set(['yes', 'true', '1', 'authorized', 'no sponsorship required', 'open to remote']);
  const noSet = new Set(['no', 'false', '0', 'unauthorized', 'requires sponsorship']);
  const isYes = yesSet.has(norm) || norm === 'true';
  const isNo = noSet.has(norm) || norm === 'false';

  for (const radio of radios) {
    const rv = normalize(radio.value || radio.nextElementSibling?.textContent || '');
    let match = rv === norm || rv.startsWith(norm) || norm.startsWith(rv);
    if (!match && isYes && yesSet.has(rv)) match = true;
    if (!match && isNo && noSet.has(rv)) match = true;
    if (match) {
      // eslint-disable-next-line no-param-reassign
      radio.checked = true;
      radio.dispatchEvent(new Event('change', { bubbles: true }));
      radio.dispatchEvent(new Event('click', { bubbles: true }));
      return true;
    }
  }
  return false;
}

function fillCheckbox(el: HTMLInputElement, value: string, confidence: number): boolean {
  if (confidence < 80) return false;
  const shouldCheck = ['true', 'yes', '1'].includes(normalize(value));
  if (el.checked !== shouldCheck) {
    // eslint-disable-next-line no-param-reassign
    el.checked = shouldCheck;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('click', { bubbles: true }));
  }
  return true;
}

export function fillField(mapping: ResolvedMapping): boolean {
  const { field, value, confidence } = mapping;
  const { el, type } = field;

  if (!value || value.trim() === '') return false;
  if (type === 'password' || type === 'submit' || type === 'reset') return false;

  const current = (el as HTMLInputElement).value?.trim() || '';
  if (current.length > 2 && type !== 'select') return false;

  try {
    if (type === 'select') return fillSelect(el as HTMLSelectElement, value);
    if (type === 'radio') return fillRadio(field.name, value, confidence);
    if (type === 'checkbox') return fillCheckbox(el as HTMLInputElement, value, confidence);
    setNativeValue(el as HTMLInputElement | HTMLTextAreaElement, value);
    return true;
  } catch {
    return false;
  }
}

// exported only to avoid unused import in some builds
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _noopProfileUsage(_: AutofillProfile): void {}

