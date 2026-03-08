/**
 * PDF text extraction for resumes. Isolated so unpdf is not in the matching.ts
 * bundle path (avoids "Critical dependency" webpack warning on /api/matches).
 */
import { error as logError } from '@/lib/logger';

const MAX_RESUME_TEXT_LEN = 4000;

export async function extractResumeTextFromStorage(
  supabase: { storage: { from: (bucket: string) => { download: (path: string) => Promise<{ data: Blob | null; error: unknown }> } } },
  pdfPath: string
): Promise<string> {
  try {
    const { data, error } = await supabase.storage.from('resumes').download(pdfPath);
    if (error || !data) return '';
    const arrayBuffer = await data.arrayBuffer();
    const { extractText } = await import('unpdf');
    const origWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      const msg = args[0];
      if (typeof msg === 'string' && (msg.includes('TT:') || msg.includes('undefined function') || msg.includes('invalid function id'))) return;
      origWarn.apply(console, args);
    };
    try {
      const { text } = await extractText(new Uint8Array(arrayBuffer), { mergePages: true });
      return (text || '').slice(0, MAX_RESUME_TEXT_LEN);
    } finally {
      console.warn = origWarn;
    }
  } catch (e) {
    logError('[resume-pdf-text] PDF extraction failed', e);
    return '';
  }
}
