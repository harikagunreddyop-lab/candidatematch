import { type ClassValue, clsx } from 'clsx';

// Simple clsx implementation (no dep needed)
export function cn(...inputs: (string | undefined | null | false | Record<string, boolean>)[]) {
  return inputs
    .filter(Boolean)
    .map(input => {
      if (typeof input === 'string') return input;
      if (typeof input === 'object' && input !== null) {
        return Object.entries(input)
          .filter(([, value]) => value)
          .map(([key]) => key)
          .join(' ');
      }
      return '';
    })
    .join(' ')
    .trim();
}

export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatRelative(date: string | Date): string {
  const now = new Date();
  const d = new Date(date);
  const diff = now.getTime() - d.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 30) return formatDate(date);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
}

export function fitScoreColor(score: number): string {
  if (score >= 70) return 'fit-score-high';
  if (score >= 40) return 'fit-score-mid';
  return 'fit-score-low';
}

export function statusColor(status: string): string {
  const map: Record<string, string> = {
    ready: 'badge-neutral',
    applied: 'badge-brand',
    screening: 'badge-warning',
    interview: 'badge-warning',
    offer: 'badge-success',
    rejected: 'badge-danger',
    withdrawn: 'badge-neutral',
    pending: 'badge-neutral',
    generating: 'badge-warning',
    compiling: 'badge-warning',
    uploading: 'badge-warning',
    completed: 'badge-success',
    failed: 'badge-danger',
  };
  return map[status] || 'badge-neutral';
}

export function truncate(str: string, len: number): string {
  if (!str) return '';
  return str.length > len ? str.slice(0, len) + '...' : str;
}

export function generateDedupeHash(title: string, company: string, location: string, jd: string): string {
  const input = [title, company, location, jd.slice(0, 500)]
    .map(s => (s || '').toLowerCase().trim())
    .join('|');
  // Simple hash for client-side, server uses sha256
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractKeywords(text: string): string[] {
  const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'shall', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'its', 'our', 'their', 'as', 'from', 'not', 'no', 'if', 'so', 'up', 'out', 'about', 'into', 'over', 'after', 'before', 'between', 'through', 'during', 'without', 'also', 'just', 'very', 'than', 'then', 'here', 'there', 'when', 'where', 'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'only', 'own', 'same', 'what', 'which', 'who', 'whom']);
  
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s+#.]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w))
    .filter((w, i, arr) => arr.indexOf(w) === i)
    .slice(0, 50);
}
