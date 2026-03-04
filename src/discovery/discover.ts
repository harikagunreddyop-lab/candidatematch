import fs from 'fs';
import path from 'path';
import { createServiceClient } from '@/lib/supabase-server';
import { log, error as logError } from '@/lib/logger';
import { detectBoards, type Provider } from './patterns';
import { validateBoard } from './validate';

interface CompanyRow {
  company_name: string;
  website: string;
}

interface DiscoveryOptions {
  csvPath?: string;
  csvUrl?: string;
  csvContent?: string;
  limit?: number;
}

export interface DiscoverySummary {
  attempted: number;
  detected: number;
  validated: number;
  connectors_created: number;
}

function parseCsvFromString(raw: string, limit?: number): CompanyRow[] {
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (!lines.length) return [];

  const header = lines[0].split(',');
  const nameIdx = header.findIndex((h) => h.trim().toLowerCase() === 'company_name');
  const siteIdx = header.findIndex((h) => h.trim().toLowerCase() === 'website');
  if (nameIdx === -1 || siteIdx === -1) return [];

  const rows: CompanyRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (limit && rows.length >= limit) break;
    const cols = lines[i].split(',');
    const company = (cols[nameIdx] ?? '').trim().replace(/^"|"$/g, '');
    const website = (cols[siteIdx] ?? '').trim().replace(/^"|"$/g, '');
    if (!company || !website) continue;
    rows.push({ company_name: company, website });
  }
  return rows;
}

async function loadCsvRows(options: DiscoveryOptions): Promise<CompanyRow[]> {
  if (options.csvContent && options.csvContent.trim()) {
    return parseCsvFromString(options.csvContent, options.limit);
  }
  if (options.csvUrl && options.csvUrl.trim()) {
    const res = await fetch(options.csvUrl, { method: 'GET', redirect: 'follow' });
    if (!res.ok) throw new Error(`Failed to fetch CSV from URL: ${res.status} ${res.statusText}`);
    const raw = await res.text();
    return parseCsvFromString(raw, options.limit);
  }
  if (options.csvPath && options.csvPath.trim()) {
    const resolved = path.isAbsolute(options.csvPath)
      ? options.csvPath
      : path.join(process.cwd(), options.csvPath);
    if (!fs.existsSync(resolved)) {
      throw new Error(
        `CSV file not found: ${resolved}. Use CSV upload or a CSV URL instead when running in serverless.`
      );
    }
    const raw = fs.readFileSync(resolved, 'utf8');
    return parseCsvFromString(raw, options.limit);
  }
  throw new Error('Provide csvPath, csvUrl, or csvContent');
}

function normalizeWebsite(website: string): string {
  let w = website.trim();
  if (!w) return '';
  if (!/^https?:\/\//i.test(w)) {
    w = 'https://' + w.replace(/^\/+/, '');
  }
  // strip trailing slash
  return w.replace(/\/$/, '');
}

const CAREER_PATHS = [
  '/careers',
  '/jobs',
  '/company/careers',
  '/about/careers',
  '/work-with-us',
];

async function fetchHtml(url: string): Promise<{ status: number; body: string | null; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(url, { method: 'GET', redirect: 'follow', signal: controller.signal });
    const status = res.status;
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('text/html')) {
      clearTimeout(timer);
      return { status, body: null, error: `Non-HTML content-type: ${ct}` };
    }
    const text = await res.text();
    clearTimeout(timer);
    const truncated = text.length > 2_000_000 ? text.slice(0, 2_000_000) : text;
    return { status, body: truncated };
  } catch (err: any) {
    clearTimeout(timer);
    return { status: 0, body: null, error: err?.message ?? String(err) };
  }
}

async function processCompany(
  supabase: ReturnType<typeof createServiceClient>,
  row: CompanyRow
): Promise<{ detected: number; validated: number; connectors_created: number }> {
  const base = normalizeWebsite(row.website);
  if (!base) return { detected: 0, validated: 0, connectors_created: 0 };

  const boardsSeen = new Set<string>();
  let detected = 0;
  let validated = 0;
  let connectors = 0;
  let anyDetection = false;
  let lastUrl: string | null = null;
  let lastError: string | null = null;
  let lastStatus: number | null = null;

  for (const p of CAREER_PATHS) {
    const url = base + p;
    lastUrl = url;
    const { status, body, error } = await fetchHtml(url);
    lastStatus = status;
    if (!body) {
      lastError = error ?? `No HTML at ${url}`;
      continue;
    }

    const boards = detectBoards(body);
    if (!boards.length) continue;
    anyDetection = true;

    for (const b of boards) {
      const key = `${b.provider}:${b.source_org}`;
      if (boardsSeen.has(key)) continue;
      boardsSeen.add(key);
      detected += 1;

      const v = await validateBoard(b.provider as Provider, b.source_org);
      const isValid = v.ok;
      if (isValid) validated += 1;

      const { error: discErr } = await supabase.from('board_discoveries').insert({
        company_name: row.company_name,
        website: row.website,
        detected_provider: b.provider,
        detected_source_org: b.source_org,
        discovered_from_url: url,
        validated: isValid,
        validation_status: v.status,
        last_error: v.error ?? null,
      });
      if (discErr) {
        const cause = (discErr as Error & { cause?: unknown })?.cause;
        const causeMsg = cause ? ` cause: ${cause instanceof Error ? cause.message : String(cause)}` : '';
        logError('[DISCOVERY] Failed to insert board_discoveries', discErr.message + causeMsg, discErr);
      }

      if (isValid) {
        const { error: connErr } = await supabase
          .from('ingest_connectors')
          .upsert(
            {
              provider: b.provider,
              source_org: b.source_org,
              is_enabled: true,
              sync_interval_min: 60,
            },
            { onConflict: 'provider,source_org' }
          );
        if (connErr) {
          const cause = (connErr as Error & { cause?: unknown })?.cause;
          const causeMsg = cause ? ` cause: ${cause instanceof Error ? cause.message : String(cause)}` : '';
          logError('[DISCOVERY] Failed to upsert connector', connErr.message + causeMsg, connErr);
        } else {
          connectors += 1;
        }
      }
    }
  }

  if (!anyDetection) {
    const { error: discErr } = await supabase.from('board_discoveries').insert({
      company_name: row.company_name,
      website: row.website,
      detected_provider: null,
      detected_source_org: null,
      discovered_from_url: lastUrl,
      validated: false,
      validation_status: lastStatus,
      last_error: lastError ?? 'No provider patterns found',
    });
    if (discErr) {
      const cause = (discErr as Error & { cause?: unknown })?.cause;
      const causeMsg = cause ? ` cause: ${cause instanceof Error ? cause.message : String(cause)}` : '';
      logError('[DISCOVERY] Failed to insert no-match board_discoveries', discErr.message + causeMsg, discErr);
    }
  }

  return { detected, validated, connectors_created: connectors };
}

async function runWithConcurrency<T>(items: T[], limit: number, fn: (item: T, index: number) => Promise<void>): Promise<void> {
  const total = items.length;
  let idx = 0;

  async function worker() {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const current = idx;
      if (current >= total) break;
      idx += 1;
      // eslint-disable-next-line no-await-in-loop
      await fn(items[current], current);
    }
  }

  const workers = Array.from({ length: Math.min(limit, total) }, () => worker());
  await Promise.all(workers);
}

export async function runDiscovery(options: DiscoveryOptions): Promise<DiscoverySummary> {
  const rows = await loadCsvRows(options);
  const supabase = createServiceClient();

  let attempted = 0;
  let detected = 0;
  let validated = 0;
  let connectors = 0;

  await runWithConcurrency(rows, 10, async (row) => {
    attempted += 1;
    try {
      const res = await processCompany(supabase, row);
      detected += res.detected;
      validated += res.validated;
      connectors += res.connectors_created;
    } catch (err: any) {
      logError('[DISCOVERY] Company processing failed', row.company_name, err?.message ?? String(err));
    }
  });

  const summary: DiscoverySummary = {
    attempted,
    detected,
    validated,
    connectors_created: connectors,
  };
  log('[DISCOVERY] Summary', summary);
  return summary;
}

// CLI entry: npm run discovery:run -- --csv ./data/companies.csv --limit 2000
if (require.main === module) {
  const args = process.argv.slice(2);
  let csvPath = '';
  let limit: number | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--csv' || args[i] === '--csvPath') {
      csvPath = args[i + 1];
      i += 1;
    } else if (args[i] === '--limit') {
      const v = parseInt(args[i + 1], 10);
      if (!Number.isNaN(v)) limit = v;
      i += 1;
    }
  }
  if (!csvPath) {
    // eslint-disable-next-line no-console
    console.error('Usage: discovery:run -- --csv <path> [--limit N]');
    process.exit(1);
  }
  runDiscovery({ csvPath, limit })
    .then((summary) => {
      // eslint-disable-next-line no-console
      console.log('Discovery summary:', summary);
      process.exit(0);
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Discovery failed:', err);
      process.exit(1);
    });
}
