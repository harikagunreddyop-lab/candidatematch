export interface JobContext {
  jobTitle: string;
  company: string;
  jobDescription: string;
  location: string;
}

function clean(s: string): string {
  return (s || '').replace(/\s+/g, ' ').trim();
}

export function extractJobContext(): JobContext {
  const titleSelectors = [
    'h1',
    '[class*="job-title"]',
    '[class*="jobtitle"]',
    '[class*="position-title"]',
    '[class*="role-title"]',
    '[data-automation-id="jobPostingHeader"]',
    '.posting-headline h2',
    '#header_role_title',
    '.jobTitle',
    '.job-title',
    '.position-name',
    '[itemprop="title"]',
  ];

  let jobTitle = '';
  for (const sel of titleSelectors) {
    const el = document.querySelector(sel);
    if (el) {
      jobTitle = clean(el.textContent || '');
      if (jobTitle) break;
    }
  }
  if (!jobTitle) jobTitle = clean(document.title.split('|')[0].split('-')[0]);

  const companySelectors = [
    '[class*="company-name"]',
    '[class*="employer-name"]',
    '[class*="organization"]',
    '[data-automation-id="jobPostingCompanyName"]',
    '.company-name',
    '.employer',
    '[itemprop="hiringOrganization"]',
    '.posting-headline h3',
    '#header_company',
  ];

  let company = '';
  for (const sel of companySelectors) {
    const el = document.querySelector(sel);
    if (el) {
      company = clean(el.textContent || '');
      if (company) break;
    }
  }
  if (!company) {
    const host = window.location.hostname;
    const match = host.match(/^([^.]+)\./);
    if (match && !['www', 'jobs', 'careers', 'apply'].includes(match[1])) {
      company = match[1].charAt(0).toUpperCase() + match[1].slice(1);
    }
  }

  const descSelectors = [
    '[class*="job-description"]',
    '[class*="job-detail"]',
    '[class*="description"]',
    '[data-automation-id="jobPostingDescription"]',
    '#jobDescriptionText',
    '.posting-description',
    '.job-desc',
    '[itemprop="description"]',
    'article',
  ];

  let jobDescription = '';
  for (const sel of descSelectors) {
    const el = document.querySelector(sel);
    if (el) {
      const text = clean(el.textContent || '');
      if (text.length > 100) {
        jobDescription = text.slice(0, 3000);
        break;
      }
    }
  }

  const locSelectors = [
    '[class*="job-location"]',
    '[class*="location"]',
    '[data-automation-id="jobPostingLocation"]',
    '[itemprop="jobLocation"]',
  ];
  let location = '';
  for (const sel of locSelectors) {
    const el = document.querySelector(sel);
    if (el) {
      location = clean(el.textContent || '');
      if (location) break;
    }
  }

  return { jobTitle, company, jobDescription, location };
}

