/* Simple standalone script to fetch jobs from Adzuna using existing .env config.
 * Run with: npx tsx scripts/fetch-adzuna-jobs.ts
 */

import 'dotenv/config';

const APP_ID = process.env.ADZUNA_APP_ID;
const APP_KEY = process.env.ADZUNA_APP_KEY;
const COUNTRY = process.env.ADZUNA_COUNTRY || 'us';

if (!APP_ID || !APP_KEY) {
  // eslint-disable-next-line no-console
  console.error('Missing ADZUNA_APP_ID or ADZUNA_APP_KEY in environment');
  process.exit(1);
}

async function fetchJobs(page = 1) {
  const url = new URL(
    `https://api.adzuna.com/v1/api/jobs/${COUNTRY}/search/${page}`,
  );
  url.searchParams.set('app_id', APP_ID!);
  url.searchParams.set('app_key', APP_KEY!);
  url.searchParams.set('results_per_page', '50');
  url.searchParams.set('sort_by', 'date');

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Adzuna request failed (${res.status}): ${text.slice(0, 400)}`,
    );
  }

  const data = (await res.json()) as { results?: unknown[] };
  return Array.isArray(data.results) ? data.results : [];
}

(async () => {
  try {
    const jobs = await fetchJobs(1);
    // eslint-disable-next-line no-console
    console.log('Jobs:', jobs.length);
    if (jobs.length > 0) {
      // eslint-disable-next-line no-console
      console.dir(jobs[0], { depth: null });
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Error fetching Adzuna jobs:', err);
    process.exit(1);
  }
})();

