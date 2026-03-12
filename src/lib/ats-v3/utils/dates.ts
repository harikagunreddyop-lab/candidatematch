import { RecencyBand } from '../types';

const MONTHS: Record<string, number> = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sep: 8,
  sept: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11,
};

export function parseDate(val: string | null | undefined): Date | null {
  if (!val) return null;
  const s = val.trim();
  if (!s) return null;

  // YYYY
  let m = /^(\d{4})$/.exec(s);
  if (m) {
    const year = Number(m[1]);
    if (year >= 1900 && year <= 2100) {
      return new Date(year, 0, 1);
    }
  }

  // MM/YYYY
  m = /^(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) {
    const month = Number(m[1]);
    const year = Number(m[2]);
    if (month >= 1 && month <= 12 && year >= 1900 && year <= 2100) {
      return new Date(year, month - 1, 1);
    }
  }

  // Month YYYY or Mon YYYY
  m = /^([A-Za-z]+)\s+(\d{4})$/.exec(s);
  if (m) {
    const monthName = m[1].toLowerCase();
    const year = Number(m[2]);
    const monthIndex = MONTHS[monthName];
    if (monthIndex !== undefined && year >= 1900 && year <= 2100) {
      return new Date(year, monthIndex, 1);
    }
  }

  // YYYY-MM
  m = /^(\d{4})-(\d{1,2})$/.exec(s);
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]);
    if (month >= 1 && month <= 12 && year >= 1900 && year <= 2100) {
      return new Date(year, month - 1, 1);
    }
  }

  return null;
}

export function monthsBetween(a: Date, b: Date): number {
  const aMonths = a.getFullYear() * 12 + a.getMonth();
  const bMonths = b.getFullYear() * 12 + b.getMonth();
  return Math.abs(bMonths - aMonths);
}

export function monthsSinceDate(d: Date): number {
  const now = new Date();
  return monthsBetween(d, now);
}

export function getRecencyBand(
  lastUsedYear: number | null,
  currentYear: number,
): RecencyBand {
  if (lastUsedYear == null) return 'undated';
  let diff = currentYear - lastUsedYear;
  if (diff < 0) diff = 0;

  if (diff <= 2) return 'current';
  if (diff <= 4) return 'recent';
  if (diff <= 6) return 'aging';
  return 'stale';
}

export function detectDateFormats(text: string): string[] {
  const formats = new Set<string>();
  if (!text) return [];

  // MM/YYYY
  if (/\b(0?[1-9]|1[0-2])\/(19|20)\d{2}\b/.test(text)) {
    formats.add('MM/YYYY');
  }

  // YYYY-MM
  if (/\b(19|20)\d{2}-(0?[1-9]|1[0-2])\b/.test(text)) {
    formats.add('YYYY-MM');
  }

  // Month YYYY (full month names)
  if (
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(19|20)\d{2}\b/i.test(
      text,
    )
  ) {
    formats.add('Month YYYY');
  }

  // Mon YYYY (short month names)
  if (
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\s+(19|20)\d{2}\b/i.test(
      text,
    )
  ) {
    formats.add('Mon YYYY');
  }

  // YYYY only (standalone year)
  if (/\b(19|20)\d{2}\b/.test(text)) {
    formats.add('YYYY');
  }

  return Array.from(formats);
}

export function isDateConsistent(formats: string[]): boolean {
  const unique = new Set(formats.filter((f) => f));
  return unique.size <= 1;
}


