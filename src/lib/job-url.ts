/**
 * Job URL utilities: validation and apply URL generation.
 */

/** Require valid http(s) URL for job apply links. */
export function isValidJobUrl(url: string | null | undefined): boolean {
  const u = typeof url === 'string' ? url.trim() : '';
  return !!(u && (u.startsWith('http://') || u.startsWith('https://')));
}

/** Returns a valid apply URL: job.url if valid, else LinkedIn job search fallback from title+company */
export function getApplyUrl(job: { url?: string | null; title?: string; company?: string } | null): string | null {
  const u = typeof job?.url === 'string' ? job.url.trim() : '';
  if (u && (u.startsWith('http://') || u.startsWith('https://'))) return u;
  const title = (job?.title || '').trim();
  const company = (job?.company || '').trim();
  if (title || company) {
    const q = [title, company].filter(Boolean).join(' ');
    if (q) return `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(q)}`;
  }
  return null;
}
