# CandidateMatch B2B SaaS Architecture Blueprint

**Version:** 1.0  
**Date:** 2025-03-07  
**Source:** Architecture Audit (docs/ARCHITECTURE_AUDIT_REPORT.md)  
**Purpose:** Single source of truth for all future development — roles, pages, data patterns, navigation, workflows.

---

## 1. Role Permissions Matrix

| Capability | Platform Admin | Company Admin | Recruiter | Candidate | Notes |
|------------|----------------|---------------|-----------|-----------|-------|
| **COMPANIES** |
| View all companies | ✅ | ❌ | ❌ | ❌ | Admin only |
| View own company | N/A | ✅ | ✅ (read) | ❌ | Company scope |
| Edit company settings | ✅ (all) | ✅ (own) | ❌ | ❌ | Owner only |
| Create company | ✅ | ❌ | ❌ | ❌ | Platform admin |
| Suspend/delete company | ✅ | ❌ | ❌ | ❌ | Platform admin |
| View company analytics | ✅ (all) | ✅ (own) | ✅ (own) | ❌ | company_analytics |
| **USERS & TEAM** |
| View all users (platform) | ✅ | ❌ | ❌ | ❌ | Admin only |
| View company team | ✅ | ✅ (own) | ✅ (own) | ❌ | profile_roles + company_id |
| Invite user to company | ❌ | ✅ | ❌ | ❌ | Company admin |
| Remove user from company | ✅ | ✅ (own) | ❌ | ❌ | Admin/owner |
| Change user role (company) | ✅ | ✅ (own) | ❌ | ❌ | Admin/owner |
| View invitations (company) | ✅ | ✅ (own) | ❌ | ❌ | company_invitations |
| **JOBS** |
| View all jobs (platform) | ✅ | ❌ | ❌ | ❌ | Admin sees all |
| View all public jobs | ❌ | ❌ | ❌ | ✅ | Candidates; is_active |
| View company jobs | ✅ | ✅ (own) | ✅ (company) | ❌ | company_id = get_user_company() |
| Create job | ❌ | ✅ | ✅ | ❌ | company_id required |
| Edit job | ✅ (all) | ✅ (co) | ✅ (own*) | ❌ | *posted_by = me for recruiter |
| Delete job | ✅ (all) | ✅ (co) | ✅ (own) | ❌ | RLS: posted_by |
| Close/reopen job | ✅ | ✅ | ✅ (own) | ❌ | is_active toggle |
| View job applications count | ✅ | ✅ (co) | ✅ (co) | ❌ | applications_count |
| **CANDIDATES** |
| View all candidates (platform) | ✅ | ❌ | ❌ | ❌ | Admin only |
| View applied/matched candidates | ✅ | ✅† | ✅† | ❌ | †Via company jobs only |
| View contact info (candidate) | ✅ | ✅† | ✅† | N/A | †After success-fee agreement |
| Edit own profile | N/A | N/A | N/A | ✅ | candidates + user_id |
| Invite candidate | ✅ | ✅ (co) | ✅ (co) | ❌ | Invite flow |
| **MATCHES** |
| View all matches | ✅ | ❌ | ❌ | ❌ | candidate_job_matches |
| View company matches | ✅ | ✅ (co) | ✅ (co) | ❌ | job_id IN company job_ids |
| View own matches | N/A | N/A | N/A | ✅ | candidate_id = me |
| Trigger matching (cron) | ✅ | ❌ | ❌ | ❌ | Admin ops |
| **APPLICATIONS** |
| View all applications | ✅ | ❌ | ❌ | ❌ | Admin analytics |
| View company applications | ✅ | ✅ (co) | ✅ (co) | ❌ | job_id IN company job_ids |
| View own applications | N/A | N/A | N/A | ✅ | candidate_id = me |
| Submit application | ❌ | ❌ | ❌ | ✅ | Candidate only |
| Update application status | ✅ | ✅ (co) | ✅ (co) | ❌ | screening→interview→offer |
| Add application notes | ✅ | ✅ | ✅ | ❌ | notes, timeline |
| **RESUMES** |
| View all resume versions | ✅ | ❌ | ❌ | ❌ | resume_versions |
| View candidate resumes (company) | ✅ | ✅† | ✅† | ❌ | †After agreement |
| Upload/edit own resume | N/A | N/A | N/A | ✅ | candidate_resumes |
| Generate tailored resume | N/A | N/A | N/A | ✅ | resume_versions per job |
| Download resume (candidate) | N/A | N/A | N/A | ✅ | Own only |
| **PIPELINE** |
| View platform pipeline | ✅ | ❌ | ❌ | ❌ | All applications |
| View company pipeline | ✅ | ✅ (co) | ✅ (co) | ❌ | Applications to company jobs |
| Move candidate stage | ✅ | ✅ | ✅ | ❌ | application.status |
| **BILLING** |
| View platform revenue (MRR/ARR) | ✅ | ❌ | ❌ | ❌ | platform_metrics / companies |
| View company billing | ✅ | ✅ (own) | ❌ | ❌ | Stripe portal |
| Change company plan | ✅ | ✅ (own) | ❌ | ❌ | Owner only |
| Manage Pro subscription | N/A | N/A | N/A | ✅ | Candidate billing |
| **SYSTEM** |
| View system health | ✅ | ❌ | ❌ | ❌ | /api/health |
| Configure connectors | ✅ | ❌ | ❌ | ❌ | Admin only |
| Run manual job sync | ✅ | ❌ | ❌ | ❌ | Admin ops |
| View cron history | ✅ | ❌ | ❌ | ❌ | cron_run_history |
| View platform metrics | ✅ | ❌ | ❌ | ❌ | platform_metrics |
| **MESSAGING** |
| View all conversations | ✅ | ❌ | ❌ | ❌ | Admin only |
| Message company candidates | ✅ | ✅ (co) | ✅ (co) | ❌ | Scoped to job/application |
| Message recruiter/company | N/A | N/A | N/A | ✅ | As candidate |
| **ACTIVITY & AUDIT** |
| View activity log (platform) | ✅ | ❌ | ❌ | ❌ | activity_log |
| View company activity | ✅ | ✅ (own) | ✅ (own) | ❌ | activity_log company_id |
| View candidate activity | ✅ | ✅† | ✅† | ✅ (own) | candidate_activity |
| View audit log | ✅ | ❌ | ❌ | ❌ | Admin only |
| **REPORTS & ANALYTICS** |
| View platform reports | ✅ | ❌ | ❌ | ❌ | Cross-company |
| View company analytics | ✅ | ✅ (own) | ✅ (own) | ❌ | company_analytics |
| View recruiter performance | ✅ | ✅ (own) | ✅ (own) | ❌ | recruiter_performance |
| View own skill report | N/A | N/A | N/A | ✅ | Candidate |
| **COMPLIANCE & INTERVIEWS** |
| View compliance dashboard | ✅ | ❌ | ❌ | ❌ | Admin only |
| View all interviews | ✅ | ✅ (co) | ✅ (co) | ✅ (own) | Scoped by role |
| Schedule interview | ✅ | ✅ | ✅ | ❌ | interview_date on application |
| **ASSIGNMENTS (legacy / demoted)** |
| Assign recruiters to candidates | ✅ | ❌ | ❌ | ❌ | Demoted; not primary flow |
| View assignments | ✅ | ❌ | ❌ | ❌ | recruiter_candidate_assignments |
| **SUCCESS FEE** |
| View success fee events | ✅ | ✅ (own) | ❌ | ❌ | success_fee_events |
| Sign success fee agreement | N/A | ✅ | N/A | ✅ | Company ↔ candidate |
| **INTEGRATIONS** |
| Manage job board connectors | ✅ | ❌ | ❌ | ❌ | Admin |
| Connect ATS (company) | ✅ | ✅ (own) | ❌ | ❌ | Company setting |
| Connect extension (candidate) | N/A | N/A | N/A | ✅ | Browser extension |
| **FEATURE FLAGS** |
| View/edit feature flags | ✅ | ❌ | ❌ | ❌ | feature_flags |
| **SETTINGS** |
| Platform settings | ✅ | ❌ | ❌ | ❌ | Admin only |
| Company settings | ✅ | ✅ (own) | ❌ | ❌ | Company admin |
| Own profile settings | ✅ | ✅ | ✅ | ✅ | profiles |

---

## 2. Complete Page Structure

### PUBLIC PAGES

| Path | Purpose | Key Sections | Data Sources | User Actions | Success Criteria |
|------|---------|---------------|--------------|--------------|------------------|
| `/` | Landing | Hero, value prop, CTA | Static / CMS | Sign up, Log in | User reaches auth or dashboard |
| `/pricing` | Plans | Tiers, features, CTA | Static / Stripe products | Choose plan, Sign up | User selects plan and signs up |
| `/auth/login` | Login | Email/password, OAuth | auth.signIn | Submit, OAuth | Session created, redirect to dashboard |
| `/auth/signup` | Signup | Email, password, role | auth.signUp | Submit | Account created, redirect |
| `/auth/callback` | OAuth callback | — | auth.getSession | — | Session set, redirect |
| `/auth/reset-password` | Password reset | Email form | auth.resetPasswordForEmail | Submit | Reset email sent |
| `/auth/complete` | Post-signup complete | Set password (invite) | auth.updateUser | Submit | invite_accepted_at set |
| `/privacy` | Privacy policy | Legal text | Static | — | Read policy |
| `/terms` | Terms of service | Legal text | Static | — | Read terms |

---

### PLATFORM ADMIN PAGES

| Path | Purpose | Key Sections | Data Sources | User Actions | Success Criteria |
|------|---------|---------------|--------------|--------------|------------------|
| `/dashboard/admin` | Overview | Companies KPIs, Revenue (MRR/ARR), System Health, Job Ingestion, Platform Totals, Recent companies/jobs/apps, Quick actions | companies (counts by status), platform_metrics or derived MRR, /api/health, cron_run_history, jobs/candidates/applications counts, recent lists | Refresh, View companies, Reports | Dashboard loads; companies first; health visible |
| `/dashboard/admin/companies` | Companies table | Table: name, status, plan, MRR, jobs, applications; filters; sort | companies, join counts (jobs, applications) | Filter, sort, Open company | List of all companies |
| `/dashboard/admin/companies/new` | Create company | Form: name, slug, plan, owner, settings | — | Submit | Company created, redirect to detail |
| `/dashboard/admin/companies/[id]` | Company detail | Header, KPIs, team, jobs, applications, activity, billing link | companies (single), profile_roles, jobs, applications (counts), company_analytics | Edit, View team/jobs, Suspend | Full company view |
| `/dashboard/admin/companies/[id]/team` | Company team | List of members, roles, invite link | profile_roles (company_id), company_invitations | Invite, Remove, Change role | Team managed |
| `/dashboard/admin/companies/[id]/jobs` | Company jobs | List of jobs for this company | jobs.eq('company_id', id) | Open job, Edit | Company jobs listed |
| `/dashboard/admin/system/health` | System health | DB, Redis, Cache status; history | /api/health | Refresh | Health checks visible |
| `/dashboard/admin/system/connectors` | Connectors list | Adapters, status, last run | Config + cron_run_history | — | Connectors listed |
| `/dashboard/admin/system/connectors/[id]` | Connector config | API keys, test, manual sync | Config store | Save, Test, Sync | Connector configured |
| `/dashboard/admin/system/cron` | Cron history | Table: mode, started_at, status, counts, error | cron_run_history | Filter by mode | History visible |
| `/dashboard/admin/system/cron/[id]` | Run detail | Single run: duration, counts, error | cron_run_history (single) | — | Debug info |
| `/dashboard/admin/candidates` | All candidates | Table with company context, filters | candidates, optional company via applications | Filter, Open candidate | Platform candidate list |
| `/dashboard/admin/candidates/[id]` | Candidate detail | Profile, matches, applications, resumes, activity | candidates, candidate_job_matches, applications, resume_versions, candidate_activity | View, Edit notes | Full candidate view |
| `/dashboard/admin/jobs` | All jobs | Table with company, source, status | jobs (all), companies (name) | Filter by company, Open | Platform job list |
| `/dashboard/admin/applications` | All applications | Table with company, job, candidate, status | applications + job (company_id) + candidate | Filter by company, Open | Platform application list |
| `/dashboard/admin/pipeline` | Platform pipeline | Kanban or list; all applications with company filter | applications + job (company_id) + candidate | Filter by company, Move stage | Pipeline view |
| `/dashboard/admin/users` | All users | Table: email, role, company | profiles, profile_roles (company) | Filter, Open | User list with company |
| `/dashboard/admin/reports` | Platform reports | MRR, signups, usage, cross-company | platform_metrics, companies, aggregates | Export, Date range | Reports generated |
| `/dashboard/admin/analytics` | Platform analytics | Charts: companies, jobs, applications over time | platform_metrics, raw aggregates | Date range | Analytics visible |
| `/dashboard/admin/assignments` | Assignments (demoted) | Assign recruiters to candidates (legacy) | recruiter_candidate_assignments | Assign, Unassign | Optional; not primary |
| `/dashboard/admin/interviews` | Interviews | List of scheduled interviews (all) | applications (interview_date), jobs, candidates | Filter, Open | Interview list |
| `/dashboard/admin/messages` | Messages | All conversations (admin) | conversations, messages | Open thread | Support-style view |
| `/dashboard/admin/compliance` | Compliance | Compliance dashboard | Config / audit | — | Compliance info |
| `/dashboard/admin/audit` | Audit log | Activity log (platform) | activity_log (platform) | Filter | Audit trail |
| `/dashboard/admin/job-boards` | Job boards | Connectors / boards config | Config | — | Boards config |
| `/dashboard/admin/settings` | Platform settings | Global settings, feature flags | feature_flags, config | Save | Settings saved |

---

### COMPANY ADMIN PAGES

| Path | Purpose | Key Sections | Data Sources | User Actions | Success Criteria |
|------|---------|---------------|--------------|--------------|------------------|
| `/dashboard/company` | Company dashboard | Company header, KPIs (jobs, applications, hires), funnel, team, active jobs, activity, billing CTA | profile_roles (company_id), company_analytics, jobs, applications (counts), profile_roles (team) | View jobs, Team, Settings | Company overview |
| `/dashboard/company/jobs` | Company jobs | List/grid of company jobs | jobs.eq('company_id', companyId) | Create, Edit, Close | Company jobs list |
| `/dashboard/company/jobs/new` | Create job | Form: title, description, requirements, location | — | Submit, AI generate | Job created |
| `/dashboard/company/jobs/[id]` | Job detail | Title, description, applicants, matches count | jobs (single), applications (count), candidate_job_matches (count) | Edit, View candidates | Job detail |
| `/dashboard/company/jobs/[id]/edit` | Edit job | Same as create form | jobs (single) | Save | Job updated |
| `/dashboard/company/jobs/[id]/candidates` | Job candidates | Matches + applications for this job | candidate_job_matches, applications (job_id) | Open candidate | Candidates for job |
| `/dashboard/company/team` | Team members | List: name, role, joined | profile_roles (company_id) | Invite, Remove | Team list |
| `/dashboard/company/team/invite` | Invite user | Email, role (admin/recruiter) | company_invitations | Send invite | Invitation sent |
| `/dashboard/company/team/[id]` | Member detail | Profile, activity, performance | profile_roles, recruiter_performance | Change role, Remove | Member managed |
| `/dashboard/company/candidates` | Applied candidates | Candidates who applied to company jobs | applications (job_id IN company jobs) → candidates | Open candidate | Candidate list |
| `/dashboard/company/candidates/[id]` | Candidate detail | Profile, applications to our jobs, fit | candidate + applications (company jobs) | View contact (if agreed), Message | Candidate view |
| `/dashboard/company/pipeline` | Hiring pipeline | Kanban by application status | applications (job_id IN company jobs) | Move stage | Pipeline view |
| `/dashboard/company/analytics` | Company analytics | Funnel, time-to-hire, top roles | company_analytics | Date range | Analytics visible |
| `/dashboard/company/activity` | Activity feed | Recent activity (company) | activity_log, candidate_activity (company_id) | Filter | Activity visible |
| `/dashboard/company/messages` | Messages | Conversations with candidates | conversations, messages (scoped) | Reply | Messaging |
| `/dashboard/company/settings` | Company settings | Name, logo, defaults | companies (single) | Save | Settings saved |
| `/dashboard/company/settings/billing` | Billing | Plan, payment method, invoice link | companies (subscription_*), Stripe portal | Upgrade, Portal | Billing managed |
| `/dashboard/company/settings/billing/upgrade` | Upgrade plan | Plan selection | Stripe products | Checkout | Plan upgraded |

---

### RECRUITER PAGES

| Path | Purpose | Key Sections | Data Sources | User Actions | Success Criteria |
|------|---------|---------------|--------------|--------------|------------------|
| `/dashboard/recruiter` | Recruiter dashboard | Stats: Active jobs, New matches, In pipeline, Interviews today; Candidates for your jobs; recent activity | profile_roles (company_id), jobs (company_id), candidate_job_matches + applications (job_id IN company jobs) | View jobs, Candidates, Pipeline | Job-based view; no assignments |
| `/dashboard/recruiter/jobs` | My company's jobs | List of company jobs (filter: my jobs optional) | jobs.eq('company_id', companyId) from profile_roles | Open job, Create (if allowed) | Company jobs only |
| `/dashboard/recruiter/jobs/new` | Create job | Same as company job form | jobs (insert company_id, posted_by) | Submit | Job created |
| `/dashboard/recruiter/jobs/[id]` | Job detail | Title, applicants, matches | jobs (single), applications, matches (job_id) | Edit (if own), View candidates | Job detail |
| `/dashboard/recruiter/jobs/[id]/edit` | Edit job | Edit form | jobs (single) | Save | Job updated (own only) |
| `/dashboard/recruiter/jobs/[id]/candidates` | Job candidates | Matches + applications | candidate_job_matches, applications (job_id) | Open candidate | Candidates for job |
| `/dashboard/recruiter/candidates` | Candidates (company jobs) | List: candidates matched or applied to company jobs | Distinct candidates from matches + applications (job_id IN company job_ids) | Open candidate | No assignments |
| `/dashboard/recruiter/candidates/[id]` | Candidate detail | Profile, fit, applications to our jobs | candidate; access check: has match or application for company job | View contact (if agreed), Message | Access only if in scope |
| `/dashboard/recruiter/applications` | Applications | Applications to company jobs | applications (job_id IN company job_ids) | Filter, Open, Update status | Company applications |
| `/dashboard/recruiter/pipeline` | My pipeline | Kanban: applications to company jobs | applications (job_id IN company job_ids) | Move stage | Pipeline by company jobs |
| `/dashboard/recruiter/reports` | Talent report | My/company performance | recruiter_performance, company_analytics | — | Reports visible |
| `/dashboard/recruiter/messages` | Messages | Conversations with candidates | conversations (participant), messages | Reply | Messaging |
| `/dashboard/recruiter/integrations` | Integrations | Linked integrations | Config | Connect | Integrations |

---

### CANDIDATE PAGES

| Path | Purpose | Key Sections | Data Sources | User Actions | Success Criteria |
|------|---------|---------------|--------------|--------------|------------------|
| `/dashboard/candidate` | Candidate dashboard | Top matches, applications, profile completeness, next step | candidate (user_id), candidate_job_matches, applications | Apply, View job | Dashboard loads |
| `/dashboard/candidate/matches` | AI matches | List of matches (fit score, job) | candidate_job_matches (candidate_id), jobs | Apply, Save job | Matches visible |
| `/dashboard/candidate/jobs` | Browse jobs | Search/filter public jobs | jobs (is_active, public) | Search, Apply, Save | Job search |
| `/dashboard/candidate/jobs/[id]` | Job detail | Title, company, description, apply CTA | jobs (single) | Apply, Save | Job detail |
| `/dashboard/candidate/applications` | My applications | List with status | applications (candidate_id), jobs | View, Withdraw | Applications list |
| `/dashboard/candidate/applications/[id]` | Application detail | Status, notes, timeline | applications (single), job | — | Application detail |
| `/dashboard/candidate/profile` | Profile | Edit profile fields | candidates (user_id) | Save | Profile updated |
| `/dashboard/candidate/profile/resume` | Resume overview | List of resumes, primary | candidate_resumes | Upload, Build, Download | Resume list |
| `/dashboard/candidate/profile/resume/upload` | Upload resume | File upload | candidate_resumes | Upload | Resume uploaded |
| `/dashboard/candidate/profile/resume/builder` | Resume builder | Tailored resume builder | resume_versions, jobs | Generate | Resume generated |
| `/dashboard/candidate/messages` | Messages | Conversations with recruiters | conversations, messages | Reply | Messaging |
| `/dashboard/candidate/onboarding` | Onboarding | Steps to complete profile | candidates | Complete steps | onboarding_completed |
| `/dashboard/candidate/settings` | Settings | Notifications, privacy | profiles, candidates | Save | Settings saved |
| `/dashboard/candidate/skill-report` | Skill report | ATS/skill insights | Candidate data, ATS API | — | Report visible |
| `/dashboard/candidate/interviews` | Interviews | My interviews | applications (candidate_id, interview_date) | — | Interview list |
| `/dashboard/candidate/reports` | Reports | ATS fix report, etc. | API | — | Reports |
| `/dashboard/candidate/connect-extension` | Extension | Install browser extension | Static | Install | Extension linked |
| `/dashboard/candidate/tools/ats-checker` | ATS checker | Paste job, get score | API | Run check | Score shown |
| `/dashboard/candidate/tools/extension` | Extension help | How to use extension | Static | — | Help |
| `/dashboard/candidate/tools/career-advice` | Career advice | AI advice | API | Ask | Advice shown |
| `/dashboard/candidate/waiting` | Waiting room | Post-apply waiting | — | — | Message shown |

---

## 3. Exact Data Access Patterns

### 3.1 Helpers and Types

```typescript
// lib/supabase-server.ts or equivalent
import { createClient } from '@supabase/supabase-js';

export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Optional: anon client for RLS-backed flows
export function createAnonClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

### 3.2 Platform Admin Queries

```typescript
// ================================================================
// PLATFORM ADMIN — Dashboard
// ================================================================

async function getPlatformAdminDashboard() {
  const supabase = createServiceClient();

  const [companiesRes, jobsRes, candidatesRes, matchesRes, applicationsRes, cronRes] = await Promise.all([
    supabase.from('companies').select('id, subscription_status, subscription_plan, is_active', { count: 'exact' }),
    supabase.from('jobs').select('id', { count: 'exact', head: true }),
    supabase.from('candidates').select('id', { count: 'exact', head: true }),
    supabase.from('candidate_job_matches').select('id', { count: 'exact', head: true }),
    supabase.from('applications').select('id', { count: 'exact', head: true }),
    supabase.from('cron_run_history').select('*').or('mode.eq.cron_ingest,mode.eq.ingest').order('started_at', { ascending: false }).limit(1).maybeSingle(),
  ]);

  const companiesData = companiesRes.data || [];
  const totalCompanies = companiesRes.count ?? companiesData.length;
  const activeCount = companiesData.filter((c: any) => c.subscription_status === 'active' && c.is_active).length;
  const trialingCount = companiesData.filter((c: any) => c.subscription_status === 'trialing').length;
  const pastDueCount = companiesData.filter((c: any) => c.subscription_status === 'past_due').length;

  const planPricing: Record<string, number> = { starter: 299, growth: 599, enterprise: 2499, unlimited: 4999 };
  const mrr = companiesData
    .filter((c: any) => ['active', 'trialing'].includes(c.subscription_status) && c.is_active)
    .reduce((sum: number, c: any) => sum + (planPricing[c.subscription_plan] || 0), 0);

  let health = { status: 'unknown' as string };
  try {
    health = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/health`).then(r => r.json());
  } catch {
    // noop
  }

  return {
    companies: { total: totalCompanies, active: activeCount, trialing: trialingCount, past_due: pastDueCount },
    revenue: { mrr, arr: mrr * 12 },
    totals: {
      jobs: jobsRes.count ?? 0,
      candidates: candidatesRes.count ?? 0,
      matches: matchesRes.count ?? 0,
      applications: applicationsRes.count ?? 0,
    },
    system: { health: health.status, lastCron: cronRes.data },
  };
}

// ================================================================
// PLATFORM ADMIN — Companies list
// ================================================================

async function getPlatformCompaniesList(filters?: { status?: string; sort?: string }) {
  const supabase = createServiceClient();
  let q = supabase.from('companies').select('*', { count: 'exact' });
  if (filters?.status) q = q.eq('subscription_status', filters.status);
  if (filters?.sort === 'applications') {
    q = q.order('total_applications', { ascending: false });
  } else {
    q = q.order('created_at', { ascending: false });
  }
  const { data, count } = await q.range(0, 49);
  return { companies: data || [], total: count ?? 0 };
}

// ================================================================
// PLATFORM ADMIN — Company detail
// ================================================================

async function getPlatformCompanyDetail(companyId: string) {
  const supabase = createServiceClient();
  const [company, team, jobs] = await Promise.all([
    supabase.from('companies').select('*').eq('id', companyId).single(),
    supabase.from('profiles').select('id, name, email, effective_role').eq('company_id', companyId),
    supabase.from('jobs').select('id, title, is_active', { count: 'exact' }).eq('company_id', companyId),
  ]);
  const jobIds = (jobs.data || []).map((j: any) => j.id);
  const { count: appCount } = await supabase.from('applications').select('id', { count: 'exact', head: true }).in('job_id', jobIds);
  return {
    company: company.data,
    team: team.data || [],
    jobsCount: jobs.count ?? 0,
    applicationsCount: appCount ?? 0,
  };
}
```

### 3.3 Company Admin Queries

```typescript
// ================================================================
// COMPANY ADMIN — Dashboard (companyId from profile_roles)
// ================================================================

async function getCompanyAdminDashboard(companyId: string) {
  const supabase = createServiceClient();

  const [company, analytics, jobsActive, team] = await Promise.all([
    supabase.from('companies').select('*').eq('id', companyId).single(),
    supabase.from('company_analytics').select('*').eq('company_id', companyId).single(),
    supabase.from('jobs').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('is_active', true),
    supabase.from('profiles').select('id, name, email, effective_role').eq('company_id', companyId),
  ]);

  const { data: jobRows } = await supabase.from('jobs').select('id').eq('company_id', companyId);
  const jobIds = (jobRows || []).map((j: any) => j.id);
  const { count: appCount } = await supabase.from('applications').select('id', { count: 'exact', head: true }).in('job_id', jobIds);

  return {
    company: company.data,
    analytics: analytics.data,
    activeJobs: jobsActive.count ?? 0,
    totalApplications: appCount ?? 0,
    team: team.data || [],
  };
}

// ================================================================
// COMPANY ADMIN — Company jobs list
// ================================================================

async function getCompanyJobsList(companyId: string, page = 0, pageSize = 20) {
  const supabase = createServiceClient();
  const from = page * pageSize;
  const to = from + pageSize - 1;
  const { data, count } = await supabase
    .from('jobs')
    .select('*', { count: 'exact' })
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .range(from, to);
  return { jobs: data || [], total: count ?? 0 };
}

// ================================================================
// COMPANY ADMIN — Company applications (pipeline)
// ================================================================

async function getCompanyApplications(companyId: string, statusFilter?: string) {
  const supabase = createServiceClient();
  const { data: jobRows } = await supabase.from('jobs').select('id').eq('company_id', companyId);
  const jobIds = (jobRows || []).map((j: any) => j.id);
  if (jobIds.length === 0) return { applications: [] };

  let q = supabase
    .from('applications')
    .select('*, job:jobs(title), candidate:candidates(full_name, email)')
    .in('job_id', jobIds)
    .order('created_at', { ascending: false });
  if (statusFilter) q = q.eq('status', statusFilter);
  const { data } = await q;
  return { applications: data || [] };
}
```

### 3.4 Recruiter Queries (B2B SaaS — job-based only)

```typescript
// ================================================================
// RECRUITER — Resolve company_id (use in all recruiter flows)
// ================================================================

async function getRecruiterCompanyId(userId: string): Promise<string | null> {
  const supabase = createServiceClient();
  const { data } = await supabase.from('profiles').select('company_id').eq('id', userId).single();
  return data?.company_id ?? null;
}

// ================================================================
// RECRUITER — Dashboard (company jobs → matches + applications)
// ================================================================

async function getRecruiterDashboard(userId: string) {
  const supabase = createServiceClient();
  const companyId = await getRecruiterCompanyId(userId);
  if (!companyId) return { companyId: null, jobCount: 0, newMatches: [], applications: [], recentCandidates: [] };

  const { data: jobRows } = await supabase.from('jobs').select('id').eq('company_id', companyId).eq('is_active', true);
  const jobIds = (jobRows || []).map((j: any) => j.id);
  if (jobIds.length === 0) return { companyId, jobCount: 0, newMatches: [], applications: [], recentCandidates: [] };

  const yesterday = new Date(Date.now() - 86400000).toISOString();
  const [newMatchesRes, applicationsRes, candidateIdsRes] = await Promise.all([
    supabase
      .from('candidate_job_matches')
      .select('*, candidate:candidates(full_name), job:jobs(title)')
      .in('job_id', jobIds)
      .gte('matched_at', yesterday)
      .gte('fit_score', 70)
      .order('fit_score', { ascending: false })
      .limit(10),
    supabase
      .from('applications')
      .select('*, candidate:candidates(full_name), job:jobs(title)')
      .in('job_id', jobIds)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase.from('candidate_job_matches').select('candidate_id').in('job_id', jobIds),
  ]);

  const appCandidateIds = (applicationsRes.data || []).map((a: any) => a.candidate_id);
  const matchCandidateIds = (candidateIdsRes.data || []).map((c: any) => c.candidate_id);
  const allCandidateIds = [...new Set([...appCandidateIds, ...matchCandidateIds])];
  const recentCandidates = allCandidateIds.length === 0 ? [] : await supabase
    .from('candidates')
    .select('id, full_name, primary_title')
    .in('id', allCandidateIds.slice(0, 20))
    .then(r => r.data || []);

  return {
    companyId,
    jobCount: jobIds.length,
    newMatches: newMatchesRes.data || [],
    applications: applicationsRes.data || [],
    recentCandidates,
  };
}

// ================================================================
// RECRUITER — Candidates list (for company jobs only)
// ================================================================

async function getRecruiterCandidatesList(userId: string, page = 0, pageSize = 20) {
  const supabase = createServiceClient();
  const companyId = await getRecruiterCompanyId(userId);
  if (!companyId) return { candidates: [], total: 0 };

  const { data: jobRows } = await supabase.from('jobs').select('id').eq('company_id', companyId);
  const jobIds = (jobRows || []).map((j: any) => j.id);
  if (jobIds.length === 0) return { candidates: [], total: 0 };

  const [matchCandIds, appCandIds] = await Promise.all([
    supabase.from('candidate_job_matches').select('candidate_id').in('job_id', jobIds),
    supabase.from('applications').select('candidate_id').in('job_id', jobIds),
  ]);
  const allIds = [...new Set([
    ...(matchCandIds.data || []).map((c: any) => c.candidate_id),
    ...(appCandIds.data || []).map((a: any) => a.candidate_id),
  ])];
  if (allIds.length === 0) return { candidates: [], total: 0 };

  const from = page * pageSize;
  const to = from + pageSize - 1;
  const { data: candidates, count } = await supabase
    .from('candidates')
    .select('*', { count: 'exact' })
    .in('id', allIds)
    .order('created_at', { ascending: false })
    .range(from, to);
  return { candidates: candidates || [], total: count ?? 0 };
}

// ================================================================
// RECRUITER — Candidate detail access check
// ================================================================

async function canRecruiterAccessCandidate(userId: string, candidateId: string): Promise<boolean> {
  const supabase = createServiceClient();
  const companyId = await getRecruiterCompanyId(userId);
  if (!companyId) return false;

  const { data: jobRows } = await supabase.from('jobs').select('id').eq('company_id', companyId);
  const jobIds = (jobRows || []).map((j: any) => j.id);
  if (jobIds.length === 0) return false;

  const [match, app] = await Promise.all([
    supabase.from('candidate_job_matches').select('id').eq('candidate_id', candidateId).in('job_id', jobIds).limit(1).maybeSingle(),
    supabase.from('applications').select('id').eq('candidate_id', candidateId).in('job_id', jobIds).limit(1).maybeSingle(),
  ]);
  return !!(match.data || app.data);
}

// ================================================================
// RECRUITER — Applications list (company jobs)
// ================================================================

async function getRecruiterApplicationsList(userId: string, statusFilter?: string) {
  const supabase = createServiceClient();
  const companyId = await getRecruiterCompanyId(userId);
  if (!companyId) return { applications: [] };

  const { data: jobRows } = await supabase.from('jobs').select('id').eq('company_id', companyId);
  const jobIds = (jobRows || []).map((j: any) => j.id);
  if (jobIds.length === 0) return { applications: [] };

  let q = supabase
    .from('applications')
    .select('*, job:jobs(title), candidate:candidates(full_name)')
    .in('job_id', jobIds)
    .order('created_at', { ascending: false });
  if (statusFilter) q = q.eq('status', statusFilter);
  const { data } = await q;
  return { applications: data || [] };
}
```

### 3.5 Candidate Queries

```typescript
// ================================================================
// CANDIDATE — Dashboard
// ================================================================

async function getCandidateDashboard(userId: string) {
  const supabase = createServiceClient();

  const { data: candidate } = await supabase.from('candidates').select('*').eq('user_id', userId).single();
  if (!candidate) return { candidate: null, matches: [], applications: [] };

  const [matches, applications] = await Promise.all([
    supabase
      .from('candidate_job_matches')
      .select('*, job:jobs(id, title, company, location, salary_min, salary_max, is_active)')
      .eq('candidate_id', candidate.id)
      .gte('fit_score', 50)
      .order('fit_score', { ascending: false })
      .limit(50),
    supabase
      .from('applications')
      .select('*, job:jobs(title, company)')
      .eq('candidate_id', candidate.id)
      .order('created_at', { ascending: false }),
  ]);

  const activeMatches = (matches.data || []).filter((m: any) => m.job?.is_active !== false);
  return { candidate, matches: activeMatches, applications: applications.data || [] };
}

// ================================================================
// CANDIDATE — Job search (public jobs)
// ================================================================

async function getCandidateJobSearch(params: { query?: string; location?: string; source?: string; page?: number; pageSize?: number }) {
  const supabase = createServiceClient();
  const page = params.page ?? 0;
  const pageSize = params.pageSize ?? 12;
  const from = page * pageSize;
  const to = from + pageSize - 1;

  let q = supabase
    .from('jobs')
    .select('*', { count: 'exact' })
    .eq('is_active', true)
    .order('scraped_at', { ascending: false });

  if (params.query?.trim()) {
    const term = `%${params.query.trim()}%`;
    q = q.or(`title.ilike.${term},company.ilike.${term}`);
  }
  if (params.location?.trim()) q = q.ilike('location', `%${params.location}%`);
  if (params.source && params.source !== 'all') q = q.eq('source', params.source);

  const { data, count } = await q.range(from, to);
  return { jobs: data || [], total: count ?? 0 };
}

// ================================================================
// CANDIDATE — Submit application
// ================================================================

async function submitApplication(candidateId: string, jobId: string, resumeVersionId?: string) {
  const supabase = createServiceClient();
  const { data, error } = await supabase.from('applications').insert({
    candidate_id: candidateId,
    job_id: jobId,
    resume_version_id: resumeVersionId || null,
    status: 'applied',
    applied_at: new Date().toISOString(),
  }).select().single();
  if (error) throw error;
  return data;
}
```

### 3.6 List / Search / Filter Patterns

```typescript
// Generic list with pagination
async function listWithPagination(
  table: string,
  select: string,
  filters: Record<string, unknown>,
  orderBy: string,
  orderAsc: boolean,
  page: number,
  pageSize: number
) {
  const supabase = createServiceClient();
  let q = supabase.from(table).select(select, { count: 'exact' });
  for (const [key, value] of Object.entries(filters)) {
    if (value == null) continue;
    if (Array.isArray(value)) q = q.in(key, value);
    else q = q.eq(key, value);
  }
  const from = page * pageSize;
  const { data, count } = await q.order(orderBy, { ascending: orderAsc }).range(from, from + pageSize - 1);
  return { data: data || [], total: count ?? 0 };
}

// Admin applications with company filter
async function getAdminApplicationsList(companyId?: string, status?: string, page = 0) {
  const supabase = createServiceClient();
  let q = supabase.from('applications').select('*, job:jobs(title, company_id, company), candidate:candidates(full_name)', { count: 'exact' });
  if (companyId) {
    const { data: jobIds } = await supabase.from('jobs').select('id').eq('company_id', companyId);
    q = q.in('job_id', (jobIds || []).map((j: any) => j.id));
  }
  if (status) q = q.eq('status', status);
  const { data, count } = await q.order('created_at', { ascending: false }).range(page * 20, page * 20 + 19);
  return { applications: data || [], total: count ?? 0 };
}
```

---

## 4. Navigation Structure

```typescript
// config/navigation.ts or inside DashboardLayout

export const platformAdminNav = [
  {
    section: 'Overview',
    items: [
      { label: 'Dashboard', href: '/dashboard/admin', icon: 'LayoutDashboard' },
      { label: 'Companies', href: '/dashboard/admin/companies', icon: 'Building2' },
    ],
  },
  {
    section: 'People & Jobs',
    items: [
      { label: 'Candidates', href: '/dashboard/admin/candidates', icon: 'Users' },
      { label: 'Applications', href: '/dashboard/admin/applications', icon: 'ClipboardList' },
      { label: 'Pipeline', href: '/dashboard/admin/pipeline', icon: 'GitBranch' },
      { label: 'Jobs', href: '/dashboard/admin/jobs', icon: 'Briefcase' },
      { label: 'Users', href: '/dashboard/admin/users', icon: 'UserCircle' },
    ],
  },
  {
    section: 'System',
    items: [
      { label: 'Health', href: '/dashboard/admin/system/health', icon: 'Activity' },
      { label: 'Connectors', href: '/dashboard/admin/system/connectors', icon: 'Link2' },
      { label: 'Cron Jobs', href: '/dashboard/admin/system/cron', icon: 'Clock' },
    ],
  },
  {
    section: 'Reports & Settings',
    items: [
      { label: 'Reports', href: '/dashboard/admin/reports', icon: 'BarChart3' },
      { label: 'Analytics', href: '/dashboard/admin/analytics', icon: 'TrendingUp' },
      { label: 'Interviews', href: '/dashboard/admin/interviews', icon: 'Calendar' },
      { label: 'Messages', href: '/dashboard/admin/messages', icon: 'MessageCircle' },
      { label: 'Audit log', href: '/dashboard/admin/audit', icon: 'FileText' },
      { label: 'Compliance', href: '/dashboard/admin/compliance', icon: 'Shield' },
      { label: 'Settings', href: '/dashboard/admin/settings', icon: 'Settings' },
    ],
  },
];

export const companyAdminNav = [
  {
    section: 'Overview',
    items: [
      { label: 'Dashboard', href: '/dashboard/company', icon: 'LayoutDashboard' },
      { label: 'Jobs', href: '/dashboard/company/jobs', icon: 'Briefcase' },
      { label: 'Candidates', href: '/dashboard/company/candidates', icon: 'Users' },
      { label: 'Pipeline', href: '/dashboard/company/pipeline', icon: 'GitBranch' },
    ],
  },
  {
    section: 'Team & Activity',
    items: [
      { label: 'Team', href: '/dashboard/company/team', icon: 'Users' },
      { label: 'Activity', href: '/dashboard/company/activity', icon: 'Activity' },
      { label: 'Analytics', href: '/dashboard/company/analytics', icon: 'BarChart3' },
      { label: 'Messages', href: '/dashboard/company/messages', icon: 'MessageCircle' },
    ],
  },
  {
    section: 'Settings',
    items: [
      { label: 'Settings', href: '/dashboard/company/settings', icon: 'Settings' },
      { label: 'Billing', href: '/dashboard/company/settings/billing', icon: 'CreditCard' },
    ],
  },
];

export const recruiterNav = [
  {
    section: 'Overview',
    items: [
      { label: 'Dashboard', href: '/dashboard/recruiter', icon: 'LayoutDashboard' },
      { label: 'Jobs', href: '/dashboard/recruiter/jobs', icon: 'Briefcase' },
      { label: 'Candidates', href: '/dashboard/recruiter/candidates', icon: 'Users' },
      { label: 'Applications', href: '/dashboard/recruiter/applications', icon: 'ClipboardList' },
      { label: 'Pipeline', href: '/dashboard/recruiter/pipeline', icon: 'GitBranch' },
    ],
  },
  {
    section: 'Tools',
    items: [
      { label: 'Reports', href: '/dashboard/recruiter/reports', icon: 'BarChart3' },
      { label: 'Integrations', href: '/dashboard/recruiter/integrations', icon: 'Plug' },
      { label: 'Messages', href: '/dashboard/recruiter/messages', icon: 'MessageCircle' },
    ],
  },
];

export const candidateNav = [
  {
    section: 'Main',
    items: [
      { label: 'Dashboard', href: '/dashboard/candidate', icon: 'LayoutDashboard' },
      { label: 'Matches', href: '/dashboard/candidate/matches', icon: 'Sparkles' },
      { label: 'Job search', href: '/dashboard/candidate/jobs', icon: 'Briefcase' },
      { label: 'Applications', href: '/dashboard/candidate/applications', icon: 'ClipboardList' },
    ],
  },
  {
    section: 'Profile & Tools',
    items: [
      { label: 'My profile', href: '/dashboard/candidate/profile', icon: 'UserCircle' },
      { label: 'Resume', href: '/dashboard/candidate/profile/resume', icon: 'FileText' },
      { label: 'Skill report', href: '/dashboard/candidate/skill-report', icon: 'BarChart3' },
      { label: 'Interviews', href: '/dashboard/candidate/interviews', icon: 'Calendar' },
      { label: 'Connect extension', href: '/dashboard/candidate/connect-extension', icon: 'Link2' },
      { label: 'Messages', href: '/dashboard/candidate/messages', icon: 'MessageCircle' },
      { label: 'Settings', href: '/dashboard/candidate/settings', icon: 'Settings' },
    ],
  },
];
```

---

## 5. Complete Workflow Definitions

### Platform Admin Workflows

| ID | Name | Trigger | Steps | Success |
|----|------|---------|-------|---------|
| PA-1 | View company performance | Admin checks company health | 1) Dashboard → Companies 2) Filter: Active 3) Sort by applications 4) Click company 5) See jobs, applications, MRR 6) Review team 7) Check activity | Quick company assessment |
| PA-2 | Check job ingestion | Verify jobs syncing | 1) Dashboard → System → Cron 2) See last run (ingest) 3) Check status/error 4) If failed → debug logs 5) Optional: System → Connectors → fix config 6) Manual sync 7) Monitor | Connector fixed; jobs syncing |
| PA-3 | Create company | New tenant onboard | 1) Companies → New 2) Fill name, slug, plan, owner 3) Submit 4) Redirect to company detail 5) Add team / billing | Company created |
| PA-4 | Suspend company | Non-payment / abuse | 1) Company detail → Settings or Billing 2) Suspend / set is_active false 3) Confirm 4) Company cannot access | Company suspended |
| PA-5 | View system health | Monitor platform | 1) Dashboard → System Health card or System → Health 2) See DB, Redis, Cache 3) If degraded → investigate 4) Fix infra | Health visible; issues resolved |
| PA-6 | View platform revenue | MRR/ARR check | 1) Dashboard (MRR/ARR on overview) or Reports 2) See MRR, ARR 3) Filter by date 4) Export if needed | Revenue visible |
| PA-7 | Debug matching | Matching issues | 1) System → Cron → match runs 2) Open failed run 3) See error_message 4) Check candidate_job_matches / logs 5) Fix and re-run | Matching fixed |
| PA-8 | View all applications | Cross-company view | 1) Applications 2) Filter by company 3) Sort by date 4) Open application 5) See job + candidate | Platform application list |
| PA-9 | Manage feature flags | Toggle features | 1) Settings → Feature flags 2) Edit key value/role 3) Save 4) Verify in app | Flags updated |
| PA-10 | Audit trail | Compliance check | 1) Audit log 2) Filter by action/company/user 3) Export 4) Review | Audit trail available |

### Company Admin Workflows

| ID | Name | Trigger | Steps | Success |
|----|------|---------|-------|---------|
| CA-1 | Post a job | Need to hire | 1) Jobs → Create 2) Fill title, description, requirements 3) Optional: AI generate 4) Preview 5) Post 5) See "Matching will run" 6) Redirect to job detail | Job posted; matching queued |
| CA-2 | Invite recruiter | Grow team | 1) Team → Invite 2) Enter email, role (recruiter/admin) 3) Send 4) Invitee gets email 5) Accept → joins company | Recruiter joined |
| CA-3 | View candidates for company jobs | See applicants | 1) Candidates or Pipeline 2) List shows candidates (matched or applied to company jobs) 3) Open candidate 4) See fit + applications | Job-based candidate list |
| CA-4 | Upgrade subscription | Need higher plan | 1) Settings → Billing 2) Upgrade 3) Select plan 4) Stripe Checkout 5) Return → plan updated | Plan upgraded |
| CA-5 | Review success fees | Billing review | 1) Billing or Reports 2) See success_fee_events 3) Review owed amounts 4) Pay via Stripe | Fees visible and paid |
| CA-6 | Compare recruiter performance | Team performance | 1) Analytics or Team 2) See recruiter_performance 3) Compare hires, time-to-interview 4) Act on low performers | Performance visible |
| CA-7 | Edit company settings | Update logo/name | 1) Settings 2) Edit name, logo, defaults 3) Save 4) Confirm | Settings saved |
| CA-8 | View pipeline | Hiring funnel | 1) Pipeline 2) See applications by stage 3) Filter by job 4) Move candidate stage 5) Save | Pipeline updated |
| CA-9 | Remove user | Offboard | 1) Team 2) Open member 3) Remove 4) Confirm 5) User loses company access | User removed |
| CA-10 | View company activity | Audit | 1) Activity 2) See activity_log (company_id) 3) Filter by action/user 4) Export | Activity visible |

### Recruiter Workflows

| ID | Name | Trigger | Steps | Success |
|----|------|---------|-------|---------|
| R-1 | See candidates for company jobs | Matching completed | 1) Dashboard → New Matches 2) Click to see matches 3) Table: fit scores, skills 4) Click candidate 5) See fit breakdown 6) Contact gated by success fee 7) Request agreement 8) After signed → contact 9) Message | Contact qualified candidates |
| R-2 | View my company's jobs | Check jobs | 1) Jobs 2) List shows company jobs only 3) Open job 4) See applicants + matches 5) Edit if own job | Company jobs only |
| R-3 | Post a job | New role | 1) Jobs → Create (or company flow) 2) Fill form 3) company_id from profile 4) posted_by = me 5) Submit 6) Job appears in my list | Job created |
| R-4 | Move candidate to interview | Pipeline | 1) Pipeline 2) Find application 3) Change status → interview 4) Set interview_date 5) Save 6) Candidate sees update | Stage updated |
| R-5 | Message candidate | Outreach | 1) Candidate detail or Messages 2) Start/open conversation 3) Send message 4) Candidate receives 5) Reply | Message sent |
| R-6 | Edit my job | Update posting | 1) Jobs → My job 2) Edit 3) Change title/description 4) Save 5) RLS: posted_by = me | Job updated |
| R-7 | Close job | Role filled | 1) Job detail 2) Close / set is_active false 3) Confirm 4) Job no longer public | Job closed |
| R-8 | View applications to company jobs | Review applicants | 1) Applications 2) List: applications to company jobs 3) Filter by status/job 4) Open 5) Update status | Applications visible |
| R-9 | Access candidate detail | View profile | 1) Candidates or Pipeline 2) Click candidate 3) Access check: has match or application for company job 4) If yes → detail 5) If no → "Not matched or applied to your company's jobs" | Correct access control |
| R-10 | View my performance | Self-review | 1) Reports 2) See recruiter_performance (own) 3) Compare to team 4) Act on goals | Performance visible |

### Candidate Workflows

| ID | Name | Trigger | Steps | Success |
|----|------|---------|-------|---------|
| C-1 | Quick apply to match | See good match | 1) Login → Dashboard 2) Top Matches 3) Click high match 4) Review job 5) Fit breakdown 6) Quick Apply 7) Application submitted 8) Redirect to applications | Fast application |
| C-2 | Browse and apply | Job search | 1) Job search 2) Filter/search 3) Open job 4) Read description 5) Apply 6) Optional: attach resume 7) Submit 8) See in applications | Application submitted |
| C-3 | Check application status | Follow up | 1) Applications 2) See status (applied, screening, interview, offer) 3) Open detail 4) See notes/timeline 5) Optional: message | Status visible |
| C-4 | Upload resume | Profile | 1) Profile → Resume 2) Upload 3) Select file 4) Parse 5) Attach to profile 6) Use in applications | Resume uploaded |
| C-5 | Generate tailored resume | Per job | 1) Job detail or Match 2) Generate tailored resume 3) AI builds 4) Download 5) Attach to application | Tailored resume generated |
| C-6 | Improve ATS score | Optimize resume | 1) ATS checker or Skill report 2) Paste job / use match 3) Run check 4) See score + suggestions 5) Edit profile/resume 6) Re-run | Score improved |
| C-7 | Save job | Later | 1) Job detail 2) Save job 3) Appears in saved 4) Apply later from saved | Job saved |
| C-8 | Complete onboarding | New user | 1) Onboarding 2) Steps: profile, resume, preferences 3) Complete 4) onboarding_completed = true 5) Redirect to dashboard | Onboarding done |
| C-9 | Message recruiter | Question | 1) Applications or Messages 2) Open conversation 3) Send message 4) Recruiter replies | Message sent |
| C-10 | Manage Pro subscription | Billing | 1) Settings 2) Billing 3) Upgrade/downgrade/cancel 4) Stripe portal 5) Return | Subscription managed |

---

## 6. Database Query Patterns Summary

| Context | Scope | Key tables | Filter pattern |
|---------|--------|------------|----------------|
| Platform admin | Global | companies, jobs, candidates, applications, cron_run_history, platform_metrics | No company filter; optional company_id filter on applications/jobs for drill-down |
| Company admin | company_id | companies, jobs, applications, profile_roles, company_analytics | company_id = get_user_company() |
| Recruiter | company_id | profile_roles → company_id; jobs (company_id); candidate_job_matches + applications (job_id IN company job_ids) | No recruiter_candidate_assignments for scope |
| Candidate | user_id / candidate_id | candidates (user_id); candidate_job_matches (candidate_id); applications (candidate_id); jobs (is_active, public) | user_id = auth.uid(); candidate_id from candidates.id |

### Recruiter scope (authoritative)

1. **company_id:** From `profiles.company_id` or `profile_roles` where `id = auth.uid()`.
2. **Job list:** `jobs` where `company_id = company_id`.
3. **Candidates:** Distinct `candidate_id` from `candidate_job_matches` and `applications` where `job_id IN (company job_ids)`.
4. **Applications:** `applications` where `job_id IN (company job_ids)`.
5. **Pipeline:** Same as applications; group by `status`.
6. **Candidate detail access:** Allow if candidate has at least one row in `candidate_job_matches` or `applications` for a company job.

### Do not use for recruiter scope

- `recruiter_candidate_assignments` — not used for B2B SaaS recruiter data scope. May remain for legacy/admin-only “Assignments” page.

---

## 7. Success Criteria (Blueprint Compliance)

- **Permissions:** Every feature checks the Role Permissions Matrix; no capability granted without a matrix row.
- **Pages:** All routes match the Complete Page Structure; purpose, data sources, and actions align.
- **Data access:** All queries follow Exact Data Access Patterns; recruiter scope is job-based only.
- **Navigation:** Sidebar and links match Navigation Structure for each role.
- **Workflows:** Critical user journeys are covered by Workflow Definitions; 40+ workflows documented.
- **B2B SaaS model:** Companies first; recruiters see company jobs and candidates matched/applied to those jobs only; no staffing-assignment primary flow.

---

*End of B2B SaaS Architecture Blueprint*
