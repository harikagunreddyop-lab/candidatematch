/**
 * Resume text extraction: PDF (unpdf), DOCX (mammoth), TXT (plain).
 * Used by upload API and ATS scoring.
 */
import { error as logError } from '@/lib/logger';

const MAX_TEXT_LEN = 50_000;

export type ResumeFileType = 'pdf' | 'docx' | 'txt';

export interface ParsedResumeData {
  name?: string;
  email?: string;
  phone?: string;
  skills: string[];
  experience: Array<{ company?: string; title?: string; start_date?: string; end_date?: string; current?: boolean; responsibilities?: string[] }>;
  education: Array<{ institution?: string; degree?: string; field?: string; graduation_date?: string }>;
}

/**
 * Extract plain text from a file buffer by type.
 */
export async function extractResumeText(
  buffer: ArrayBuffer | Buffer,
  fileType: ResumeFileType
): Promise<string> {
  const arr = buffer instanceof Buffer ? new Uint8Array(buffer) : new Uint8Array(buffer);
  if (fileType === 'pdf') return extractPdfText(arr);
  if (fileType === 'docx') return extractDocxText(arr);
  if (fileType === 'txt') return extractTxtText(arr);
  return '';
}

async function extractPdfText(arr: Uint8Array): Promise<string> {
  try {
    const { extractText } = await import('unpdf');
    const origWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      const msg = args[0];
      if (typeof msg === 'string' && (msg.includes('TT:') || msg.includes('undefined function') || msg.includes('invalid function id'))) return;
      origWarn.apply(console, args);
    };
    try {
      const { text } = await extractText(arr, { mergePages: true });
      return (text || '').slice(0, MAX_TEXT_LEN);
    } finally {
      console.warn = origWarn;
    }
  } catch (e) {
    logError('[resume-parse] PDF extraction failed', e);
    return '';
  }
}

async function extractDocxText(arr: Uint8Array): Promise<string> {
  try {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer: Buffer.from(arr) });
    return (result.value || '').slice(0, MAX_TEXT_LEN);
  } catch (e) {
    logError('[resume-parse] DOCX extraction failed', e);
    return '';
  }
}

function extractTxtText(arr: Uint8Array): Promise<string> {
  try {
    const decoder = new TextDecoder('utf-8', { fatal: false });
    const text = decoder.decode(arr);
    return Promise.resolve(text.slice(0, MAX_TEXT_LEN));
  } catch {
    return Promise.resolve('');
  }
}

/**
 * Heuristic extraction of structured fields from resume text.
 * Used to prefill profile and for ATS keyword detection.
 */
export function parseResumeStructured(text: string): ParsedResumeData {
  const t = text || '';
  const emailMatch = t.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/);
  const phoneMatch = t.match(/(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b/);
  const lines = t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const skills: string[] = [];
  const experience: ParsedResumeData['experience'] = [];
  const education: ParsedResumeData['education'] = [];

  // Common section headers (case-insensitive)
  const skillHeaders = /^(skills?|technical skills?|technologies|core competencies?|expertise|tools)\s*[:|]?\s*$/i;
  const expHeaders = /^(experience|work experience|employment|professional experience|career)\s*[:|]?\s*$/i;
  const eduHeaders = /^(education|academic|degrees?)\s*[:|]?\s*$/i;

  let section: 'skills' | 'experience' | 'education' | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (skillHeaders.test(line)) {
      section = 'skills';
      continue;
    }
    if (expHeaders.test(line)) {
      section = 'experience';
      continue;
    }
    if (eduHeaders.test(line)) {
      section = 'education';
      continue;
    }
    if (section === 'skills' && line.length < 80 && !line.match(/^\d/)) {
      const tokens = line.split(/[,;|]|\band\b/).map((s) => s.trim()).filter((s) => s.length > 1 && s.length < 50);
      skills.push(...tokens);
    }
  }

  // Fallback: take first line as name if it's short and has no @
  let name: string | undefined;
  if (lines[0] && !lines[0].includes('@') && lines[0].length < 60) {
    name = lines[0];
  }

  return {
    name,
    email: emailMatch?.[0],
    phone: phoneMatch?.[0],
    skills: Array.from(new Set(skills)).slice(0, 80),
    experience,
    education,
  };
}
