import type { AutofillProfile } from '../api';

const EEO_LABEL_PATTERNS = [
  /gender/i,
  /sex\b/i,
  /ethnic/i,
  /race\b/i,
  /veteran/i,
  /military/i,
  /disabilit/i,
  /accommodation/i,
];

export function isEeoField(label: string): boolean {
  return EEO_LABEL_PATTERNS.some((p) => p.test(label));
}

const PREFER_NOT_TO_SAY_PATTERNS = [
  /prefer not/i,
  /decline to/i,
  /not specified/i,
  /choose not/i,
  /i don't wish/i,
  /do not wish/i,
  /no response/i,
];

export function getEeoDefault(
  el: HTMLSelectElement,
  fieldType: 'gender' | 'ethnicity' | 'veteranStatus' | 'disabilityStatus',
  profile: AutofillProfile
): string | null {
  const options = Array.from(el.options).map((o) => o.text);

  const preferNotTo = options.find((o) => PREFER_NOT_TO_SAY_PATTERNS.some((p) => p.test(o)));
  if (preferNotTo) return preferNotTo;

  const profileVal = profile[fieldType];
  if (profileVal && typeof profileVal === 'string') return profileVal;

  return null;
}

