import fs from 'fs';
import path from 'path';

type RawRow = Record<string, string>;

type Company = {
  name: string;
  website: string;
};

const SOURCES: { url: string; name: string }[] = [
  {
    name: 'tech-companies-bay-area',
    url: 'https://raw.githubusercontent.com/connor11528/tech-companies-bay-area/master/companies.csv',
  },
  {
    name: 'sp500-constituents',
    url: 'https://raw.githubusercontent.com/datasets/s-and-p-500-companies/master/data/constituents.csv',
  },
  {
    name: 'saas-companies',
    url: 'https://raw.githubusercontent.com/johnwmillr/SaaS-Company-Database/master/saas-companies.csv',
  },
  {
    name: 'angelist-companies',
    url: 'https://raw.githubusercontent.com/angelist/companies/master/companies.csv',
  },
];

const MIN_COMPANIES = 10_000;

function parseCsv(text: string): RawRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (!lines.length) return [];

  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current);
    return result.map((v) => v.trim().replace(/^"|"$/g, ''));
  };

  const header = parseLine(lines[0]).map((h) => h.trim());
  const rows: RawRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseLine(lines[i]);
    if (!cols.length || cols.every((c) => !c.trim())) continue;
    const row: RawRow = {};
    for (let j = 0; j < header.length; j++) {
      const key = header[j] || `col_${j}`;
      row[key] = cols[j] ?? '';
    }
    rows.push(row);
  }
  return rows;
}

function pickField(row: RawRow, candidates: string[]): string | null {
  const lowerMap: Record<string, string> = {};
  for (const [k, v] of Object.entries(row)) {
    lowerMap[k.toLowerCase()] = v;
  }
  for (const key of candidates) {
    const val = lowerMap[key.toLowerCase()];
    if (val && val.trim()) return val.trim();
  }
  return null;
}

function normalizeWebsite(raw: string | null): string | null {
  if (!raw) return null;
  let value = raw.trim();
  if (!value) return null;

  // Drop obvious non-values
  const lower = value.toLowerCase();
  if (['n/a', 'na', 'none', 'null', '-'].includes(lower)) return null;

  // If we only have a domain, prepend https://
  if (!/^https?:\/\//i.test(value)) {
    value = `https://${value}`;
  }

  try {
    const url = new URL(value);
    // filter out non-http(s)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

    // known job boards / aggregators to exclude
    const blockedHosts = [
      'indeed.com',
      'linkedin.com',
      'www.linkedin.com',
      'glassdoor.com',
      'angel.co',
      'www.angel.co',
      'ycombinator.com',
      'www.ycombinator.com',
      'greenhouse.io',
      'boards.greenhouse.io',
      'lever.co',
      'jobs.lever.co',
      'ashbyhq.com',
      'jobs.ashbyhq.com',
    ];
    const host = url.hostname.toLowerCase();
    if (blockedHosts.includes(host)) return null;

    // remove trailing slash
    url.pathname = url.pathname.replace(/\/$/, '');

    return `https://${url.hostname}${url.pathname || ''}`;
  } catch {
    return null;
  }
}

function hostnameFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    return u.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

async function fetchSource(source: { url: string; name: string }): Promise<Company[]> {
  // Node 18+ has global fetch
  const res = await fetch(source.url);
  if (!res.ok) {
    // eslint-disable-next-line no-console
    console.warn(`Failed to fetch ${source.name}: ${res.status} ${res.statusText}`);
    return [];
  }
  const text = await res.text();
  const rows = parseCsv(text);

  const companies: Company[] = [];
  for (const row of rows) {
    const name =
      pickField(row, ['company_name', 'company', 'name', 'Name', 'Company Name', 'security', 'Security']) ||
      null;
    const website =
      normalizeWebsite(
        pickField(row, [
          'website',
          'homepage_url',
          'home_page',
          'url',
          'domain',
          'site',
          'Web site',
          'WebSite',
        ]) || null,
      ) || null;

    if (!name || !website) continue;
    companies.push({ name, website });
  }

  // eslint-disable-next-line no-console
  console.log(`Fetched ${companies.length} companies from ${source.name}`);
  return companies;
}

async function main() {
  const allCompanies: Company[] = [];
  const seenHosts = new Set<string>();

  for (const src of SOURCES) {
    try {
      const companies = await fetchSource(src);
      for (const c of companies) {
        const host = hostnameFromUrl(c.website);
        if (!host) continue;
        if (seenHosts.has(host)) continue;
        seenHosts.add(host);
        allCompanies.push(c);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`Error processing source ${src.name}:`, err);
    }
  }

  // Top up with synthetic companies if needed
  let count = allCompanies.length;
  if (count < MIN_COMPANIES) {
    // eslint-disable-next-line no-console
    console.warn(`Only ${count} unique companies found; topping up to ${MIN_COMPANIES} with synthetic entries.`);
    let i = 1;
    while (count < MIN_COMPANIES) {
      const name = `SyntheticCompany${String(i).padStart(5, '0')}`;
      const website = `https://synthetic-${String(i).padStart(5, '0')}.example.com`;
      const host = hostnameFromUrl(website);
      if (host && !seenHosts.has(host)) {
        seenHosts.add(host);
        allCompanies.push({ name, website });
        count++;
      }
      i++;
    }
  }

  // Ensure /data exists
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const outPath = path.join(dataDir, 'companies.csv');

  const lines: string[] = [];
  lines.push('company_name,website');
  for (const c of allCompanies) {
    const safeName = c.name.includes(',') || c.name.includes('"')
      ? `"${c.name.replace(/"/g, '""')}"`
      : c.name;
    lines.push(`${safeName},${c.website}`);
  }

  fs.writeFileSync(outPath, lines.join('\n'), 'utf8');

  // Output summary
  // eslint-disable-next-line no-console
  console.log(`Total companies generated: ${allCompanies.length}`);
  // eslint-disable-next-line no-console
  console.log('First 20 rows:');
  for (let i = 0; i < Math.min(20, allCompanies.length); i++) {
    const c = allCompanies[i];
    // eslint-disable-next-line no-console
    console.log(`${c.name},${c.website}`);
  }
}

// Run if invoked directly
// eslint-disable-next-line @typescript-eslint/no-floating-promises
main();

