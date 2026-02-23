# Orion CMOS — Resume Factory

Production-ready AI-powered resume generation and job matching platform.

## Architecture

```
┌──────────────────┐     ┌─────────────────┐     ┌──────────────┐
│   Next.js App    │────▶│   Supabase      │     │  Apify       │
│   (Vercel)       │     │   (Postgres +   │     │  (Scraping)  │
│                  │     │    Auth +        │     └──────────────┘
│  • Admin Panel   │     │    Storage)      │
│  • Recruiter UX  │     └─────────────────┘
│  • Candidate View│              ▲
└────────┬─────────┘              │
         │                        │
         ▼                        │
┌──────────────────┐              │
│  Resume Worker   │──────────────┘
│  (Docker/VPS)    │
│                  │
│  • Claude API    │
│  • LaTeX/Tectonic│
│  • PDF Upload    │
└──────────────────┘
```

## Quick Start

### 1. Prerequisites
- Node.js 20+
- Supabase project (free tier works)
- Anthropic API key
- Apify account (for job scraping)

### 2. Setup Supabase
1. Create a new Supabase project
2. Run the migration file in the SQL editor:
   ```
   supabase/migrations/001_initial.sql
   ```
3. Enable Google OAuth in Authentication → Providers
4. Copy your project URL and keys

### 3. Configure Environment
```bash
cp .env.example .env
# Fill in all values
```

### 4. Install & Run Frontend
```bash
npm install
npm run dev
# Opens at http://localhost:3000
```

### 5. Run Resume Worker
```bash
cd worker
npm install
npm run dev
# Runs at http://localhost:3001
```

### 6. First Admin Setup
1. Sign in via Google/Magic Link
2. In Supabase SQL editor, promote yourself to admin:
   ```sql
   UPDATE profiles SET role = 'admin' WHERE email = 'your@email.com';
   ```

## Deployment

### Frontend → Vercel
```bash
vercel --prod
```
Set all environment variables in Vercel dashboard.

### Worker → Docker
```bash
docker-compose up -d
```
Or deploy to Cloud Run / Railway / Fly.io.

## Features

### Phase 1: Job Scraping
- Apify integration (LinkedIn + Indeed)
- Automatic deduplication (hard + soft hash)
- HTML stripping and normalization
- Manual job entry support

### Phase 2: Auto-Matching
- Title-based filtering with fuzzy matching
- Skill overlap scoring (0-100)
- Top 50 matches per candidate
- Hourly background runs

### Phase 3: Recruiter UX
- Candidate cards with skills/location
- Tabbed detail view (Profile, Matches, Applications, Resumes)
- One-click resume generation
- Application tracking

### Phase 4: Resume Generation
- Claude STAR-format bullet generation
- LaTeX template injection
- Tectonic PDF compilation
- Version tracking per candidate/job

### Phase 5: Apply Flow
- PDF download (signed URLs)
- External job link
- "Mark Applied" workflow
- Status tracking

### Phase 6: Candidate Dashboard
- View-only applied jobs table
- Status tracking
- No download access

## Database Schema

| Table | Purpose |
|-------|---------|
| profiles | User accounts with roles |
| candidates | Candidate profiles with experience/skills |
| recruiter_candidate_assignments | Recruiter ↔ Candidate mapping |
| jobs | Scraped + manual job listings |
| candidate_job_matches | Match scores and keywords |
| resume_versions | Generated resume PDFs |
| applications | Application status tracking |
| scrape_runs | Scraping history |

## Security

- **RLS**: All tables have row-level security
- **Roles**: admin, recruiter, candidate
- **Storage**: Private bucket, signed URLs only
- **Auth**: Supabase Auth (Google + Magic Link)

## Scaling

- Frontend: Vercel auto-scales
- Worker: Horizontal scaling via Docker replicas
- Database: Supabase handles connection pooling
- Queue: Add Bull/Redis for worker queue at scale
- Caching: Add Redis for match results

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, Tailwind CSS |
| Backend | Supabase (Postgres + Auth + Storage) |
| AI | Anthropic Claude API |
| Scraping | Apify (LinkedIn + Indeed) |
| PDF | LaTeX + Tectonic |
| Worker | Node.js + Fastify |
| Deploy | Vercel + Docker |
