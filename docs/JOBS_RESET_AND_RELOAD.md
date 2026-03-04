# Jobs Reset and Reload Workflow

This guide covers clearing all jobs from the system and re-uploading only jobs with valid application URLs.

## Step 1: Clear All Jobs

**Admin Dashboard → Scraping**

1. Go to **Admin → Scraping**
2. Click **Clear All Jobs** (red button)
3. Confirm the action

This deletes all jobs from the database. Due to foreign key cascades, the following are also removed:
- All `candidate_job_matches`
- All `applications`
- Related records in `resume_versions`, `application_reminders`, etc.
- Scrape run history

## Step 2: Re-upload Jobs (Valid URLs Only)

Jobs are now filtered at ingest time. Only jobs with a **valid application URL** (must start with `http://` or `https://`) are stored.

### Option A: Job Scraping (LinkedIn / Indeed)

1. Go to **Admin → Scraping**
2. Enter search query and location
3. Click **Start Scrape**
4. Scraped jobs **without a valid URL are skipped** automatically

### Option B: Manual Upload (CSV / Excel)

1. Go to **Admin → Jobs**
2. Click **Upload Jobs** (or **Import**)
3. Drop or select a file (Apify LinkedIn export, or CSV with columns: `job_title`, `company_name`, `job_url` or `apply_url`, etc.)
4. Ensure your file has a URL column mapped: `job_url`, `apply_url`, `linkedinUrl`, `url`, etc.
5. Upload

Jobs **without a valid URL are skipped**. The import result shows:
- **Jobs added** — inserted
- **Duplicates skipped**
- **Invalid rows** — missing title/company
- **No valid URL** — had title/company but URL was missing or invalid

## URL Validation Rules

- URL must be a non-empty string
- Must start with `http://` or `https://`
- Jobs with empty, relative, or malformed URLs are rejected

## After Reload

1. Run **Matching** from **Admin → Settings** or via the cron job to re-match candidates to the new jobs
2. Candidates will see only jobs with valid Apply links
