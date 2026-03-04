# CandidateMatch — Features, Implementations & Roadmap by Role

**Date:** March 3, 2025  
**Scope:** Implemented features, UI improvements, and future ideas per role (Candidate, Recruiter, Admin).

---

## 1. Implemented Features (All Roles)

| Feature | Description | Who |
|---------|-------------|-----|
| **Authentication** | Email/password sign-in, role-based access | All |
| **Dashboard** | Role-specific landing with stats and shortcuts | All |
| **Profile** | Edit name, title, location, skills, education, experience | Candidate, Admin |
| **Settings** | Preferences, notifications | All |

---

## 2. Implemented Features — Candidate

| Feature | Description |
|---------|-------------|
| **My Jobs** | Job matches based on target titles and skills |
| **Applications** | Track applied jobs, status (applied, screening, interview, offer, rejected) |
| **Saved Jobs** | Bookmark jobs; same apply/tailor rules as My Jobs |
| **ATS Score** | 80+ green (apply-ready), 61–79 amber (tailor first), ≤60 red (improve resume) |
| **Apply** | Apply only when ATS ≥80; resume picker, confirm applied |
| **Tailor Resume** | AI-tailored resume per job; enabled when ATS 61–79; applies only after tailor raises score to ≥80 |
| **Paste JD & Check ATS** | Paste any job description (no word/char limit); instant ATS score and breakdown |
| **ATS Breakdown** | Collapsible panel with dimension scores, 80/61 thresholds, calibration badge; **Improve bullets with AI** (bullet rewrite) |
| **Match “Why”** | Expandable section explaining match reasons |
| **Job Age Badge** | New, 1 week, 2 weeks+ styling |
| **Tailor CTA** | "Run ATS to see new score" after tailor completes |
| **Onboarding Checklist** | Upload resume, run ATS, apply, complete profile |
| **Waiting Page** | Invite-only flow; polls until recruiter assigned, then redirects to dashboard |
| **Connect Extension** | Link session token to Chrome autofill extension; Ctrl+Shift+F on job pages |
| **Profile AI Autofill** | AI fills profile from resume (skills, experience, education) |
| **Interviews** | List of applications in interview stage |
| **Skill Report** | Gap analysis vs. target roles; ATS check batch for target job |
| **Resume Upload** | Multiple resume variants (PDF, max 10MB) |
| **Human Review** | Request human review when blocked from applying (adverse action notice) |
| **Reminders** | Add/remove reminders per application |
| **Pipeline View** | Stage progress per application |
| **Messages** | Messaging with recruiter |
| **Reports** | Basic activity reports |

---

## 3. Implemented Features — Recruiter

| Feature | Description |
|---------|-------------|
| **Candidates** | Assigned candidates list with search and filters |
| **Candidate Detail** | Profile, matches, applications, resumes, notes |
| **Paste JD & Check ATS** | Paste any job description; see candidate's ATS score (no word/char limit) |
| **ATS Check Batch** | Run ATS on all candidate's matches (admin candidate view) |
| **Profile AI Autofill** | AI fills candidate profile from resume |
| **Pipeline** | Applications by stage (applied, screening, interview, offer, rejected) |
| **Status Updates** | Move applications between stages |
| **Email Draft** | AI-generated outreach email per job |
| **Brief** | AI-generated candidate brief per job |
| **Interview Kit** | AI-generated interview questions for applications in interview stage |
| **Resume Upload** | Upload resume on behalf of candidate |
| **Applications** | View and manage applications |
| **Integrations** | Gmail OAuth (connect, sync, disconnect) |
| **Messages** | Messaging with candidates |
| **Talent Report** | Pipeline and activity reports |

---

## 4. Implemented Features — Admin

| Feature | Description |
|---------|-------------|
| **Users** | Invite, manage users; role assignment; **per-user feature flags** (candidate + recruiter flags) |
| **Candidates** | Full list; search, filter (assignment, active, recruiter); **sortable** (Name, Title, Added); real-time updates |
| **Candidate Detail** | Full profile, matches, applications, resumes, saved jobs, reminders; **ATS Check Batch**; export candidate; refresh matches |
| **Jobs** | Job list, create/edit jobs, scrape JDs, upload jobs |
| **Pipeline** | Funnel view; recruiter/stage filters; **CSV export** |
| **Applications** | All applications with filters |
| **Assignments** | Recruiter–candidate assignments |
| **Compliance** | Adverse-action views; **human review requests** (candidates request; recruiter/admin apply on behalf) |
| **Interviews** | Interview scheduling/management |
| **Reports** | Analytics, calibration |
| **Calibration Rebuild** | Rebuild calibration curves |
| **Messages** | System-wide messaging |
| **Settings** | App settings (saved jobs, reminders, export toggles); **Matching engine controls** |
| **Scraping** | **Removed** — jobs now come from ingest connectors, CSV/Excel upload, and manual entry |
| **Audit** | Decision audit trail |
| **Send Password Reset** | Admin can trigger password reset email for users |
| **Notification Bell** | Unread messages count in nav |

---

## 5. Implemented UI Improvements

| Area | Implementation |
|------|----------------|
| **ATS Score Bands** | 80+ green, 61–79 amber, ≤60 red across all views |
| **Apply/Tailor Gating** | Clear messages per band; no apply/tailor below 60 |
| **Empty States** | Short copy with primary CTAs |
| **Loading States** | Spinner, Skeleton, CardSkeleton |
| **Toast** | Success/error toasts with auto-dismiss |
| **Modal** | Escape to close, focus trap, ARIA |
| **Card Hover** | Subtle transition on hover |
| **ATS Tooltip** | Hover shows band explanation |
| **Calibration Badge** | "~X% interview chance" when `p_interview` exists |
| **Responsive** | Breakpoints for cards, tables, modals |
| **Dark Mode** | Full dark theme support |
| **Form Labels** | Explicit labels, aria-describedby |
| **Paste JD** | No word/character limit; accepts any length JD |
| **Sortable Headers** | Admin candidates: sort by Name, Title, Added |
| **CSV Export** | Admin pipeline export |
| **Unread Badge** | Messages nav item shows unread count |

---

## 6. Future Features — Candidate Only

| Feature | Description | Priority |
|---------|-------------|----------|
| **Skill Heatmap** | Visual heatmap of skills vs. target roles | High |
| **Interview Prep AI** | AI-generated prep tips per application (status = interview) | High |
| **Resume Diff** | Side-by-side original vs tailored bullets | Medium |
| **Gamification** | Streaks, milestones ("5 applications this week", "First interview") | Medium |
| **Personalized Recommendations** | "Recommended for you" based on skills + past applications | High |
| **Saved Search Alerts** | Notify when new jobs match saved criteria | Medium |
| **Cover Letter Generator** | AI-generated cover letter per job | Medium |
| **Application Timeline** | Visual timeline per application with notes | Low |
| **PWA / Install** | Installable app, offline cache | Medium |
| **Quick Actions Widget** | Apply or ATS check from home screen | Low |
| **Dyslexia-Friendly Font** | Optional OpenDyslexic | Low |
| **Reduced Motion** | Respect `prefers-reduced-motion` | Medium |

---

## 7. Future Features — Recruiter Only

| Feature | Description | Priority |
|---------|-------------|----------|
| **Bulk Actions** | Multi-select: update status, assign, export | High |
| **Pipeline Drag-Drop** | Drag applications between stages with visual feedback | High |
| **Date Range Presets** | 7d, 30d, 90d for matches/applications | Medium |
| **Collaborative Notes** | Threaded comments on applications/candidates | Medium |
| **Presence** | "Admin viewing this candidate" | Low |
| **Bulk Email** | Send outreach to multiple candidates at once | Medium |
| **Candidate Comparison** | Side-by-side compare 2–3 candidates | Medium |
| **Interview Scheduler** | Book interviews with calendar integration | High |
| **Export Pipeline** | CSV/PDF export per recruiter | Medium |
| **Saved Candidate Pools** | Save filtered lists for reuse | Low |
| **ATS Override Badge** | Show "override" when applied despite low score | High |

---

## 8. Future Features — Admin Only

| Feature | Description | Priority |
|---------|-------------|----------|
| **Command Palette** | Cmd+K: quick search jobs, candidates, navigate | High |
| **Bulk User Actions** | Multi-select: assign role, enable/disable, export | High |
| **Feature Flags UI** | Toggle flags per org/user in settings | High |
| **Usage Analytics** | Dashboards, limits, quotas | High |
| **Audit Log Viewer** | Searchable admin audit | High |
| **Bias Reports** | Aggregate analytics (anonymized) across demographics | Medium |
| **Calibration Curves** | Score vs P(interview) charts | Medium |
| **Custom Fields** | Org-specific metadata on candidates/jobs | Medium |
| **Multi-Tenant** | Orgs, permissions, data isolation | High |
| **SSO / SAML / SCIM** | Enterprise identity, provisioning | High |
| **Webhooks** | On apply, status change, new match | Medium |
| **API Playground** | Try endpoints in browser | Low |
| **White-Label** | Logos, colors, domain for agencies | Medium |

---

## 9. Shared Future Features (All Roles)

| Feature | Description | Priority |
|---------|-------------|----------|
| **Real-Time Updates** | Live status changes via Supabase realtime | High |
| **Command Palette** | Cmd+K navigation (per-role actions) | High |
| **Toast Undo** | Action undo where possible | Medium |
| **ATS Dimension Chart** | Radial/bar chart for dimension scores | Medium |
| **Animations** | Modal enter/exit, list reorder | Low |
| **Micro-Interactions** | Button press feedback, success checkmark | Low |
| **i18n** | RTL, locale-aware dates/numbers | Medium |
| **Screen Reader** | Landmarks, live regions, semantic HTML | High |
| **Keyboard-First** | All flows completable via keyboard | High |

---

## 10. API & Integrations Implemented

| API / Integration | Description |
|-------------------|-------------|
| **ATS** | |
| `POST /api/ats/check-paste` | Paste JD → ATS check (ephemeral, no limit) |
| `POST /api/ats/check` | Run ATS for candidate–job pair |
| `POST /api/ats/check-batch` | Batch ATS for candidate across all matches |
| `POST /api/ats/bullet-rewrite` | AI improve resume bullets with [METRIC_NEEDED]/[TOOL_NEEDED] placeholders |
| `POST /api/ats/interview-kit` | AI-generated interview questions per application |
| **Applications** | |
| `POST/PATCH /api/applications` | Create/update application |
| `GET /api/applications/timeline` | Application timeline events |
| `GET /api/applications/usage` | Usage stats |
| **Resumes** | |
| `GET/POST/DELETE /api/resumes` | List, generate (tailor), upload, delete resumes |
| `GET/POST/DELETE /api/candidate-resumes` | Candidate resume CRUD |
| **Profile** | |
| `POST /api/profile/ai-fill` | AI autofill profile from resume |
| **AI/Briefs** | |
| `POST /api/candidate-brief` | AI job brief for candidate |
| `POST /api/candidate-job-brief` | AI candidate–job brief |
| `POST /api/recruiter-ai` | Recruiter AI (email draft, brief) |
| **Compliance** | |
| `GET/POST /api/compliance` | Adverse action, human review requests, apply on behalf |
| **Integrations** | |
| `GET /api/integrations/gmail/auth` | Gmail OAuth init |
| `GET /api/integrations/gmail/callback` | OAuth callback |
| `GET /api/integrations/gmail/status` | Gmail connection status |
| `POST /api/integrations/gmail/sync` | Sync Gmail emails |
| `DELETE /api/integrations/gmail/disconnect` | Disconnect Gmail |
| **Autofill (Extension)** | |
| `GET /api/autofill-profile` | Profile data for extension (CORS) |
| `GET/POST /api/autofill/resumes` | Resume list for extension |
| `POST /api/autofill/resumes/download` | Resume download for extension |
| `GET/POST /api/autofill/mappings` | Job field mappings |
| `POST /api/autofill/events` | Autofill event logging |
| **Admin** | |
| `GET /api/admin/export-candidate` | Export candidate data |
| `POST /api/admin/calibration/rebuild` | Rebuild calibration curves |
| `POST /api/admin/send-password-reset` | Send password reset email |
| **Other** | |
| `GET/POST/DELETE /api/matches` | Matches for candidate |
| `POST /api/invite` | Invite user |
| `POST /api/invite/accept-invite` | Accept invite |
| `POST /api/upload-jobs` | Bulk upload jobs |
| *(removed)* `GET/POST/DELETE /api/scraping` | Job scraping (feature removed; use upload-jobs + ingest connectors) |
| `GET/POST /api/hide-job` | Hide job from candidate |
| `GET /api/feature-flags` | List feature flags |
| `GET/PATCH /api/feature-flags/user` | User feature flags |
| `GET /api/candidate-export` | Candidate export personal data |
| **Cron** | `GET /api/cron/match`, `GET /api/cron/cleanup`, `GET /api/cron/history` |
| **Realtime** | Supabase: admin candidates, pipeline, layout unread count, candidate dashboard |

---

## 11. Feature Flags

**Candidate (per-user, Admin Users page):**  
`candidate_see_matches`, `candidate_apply_jobs`, `candidate_upload_resume`, `candidate_download_resume`, `candidate_save_jobs`, `candidate_see_ats_fix_report`, `candidate_see_why_score`, `candidate_job_brief`, `candidate_tailor_resume`, `candidate_reminders`, `candidate_messages`, `candidate_export_data`

**Recruiter (per-user):**  
`recruiter_view_candidates`, `recruiter_view_matches`, `recruiter_manage_applications`, `recruiter_view_pipeline`, `recruiter_run_ats_check`, `resume_generation_allowed`, `recruiter_bulk_apply`, `recruiter_ai_assistant`

**App settings (Admin Settings page):**  
`feature_candidate_saved_jobs`, `feature_candidate_reminders`, `feature_candidate_export`

---

## 12. Changelog
- **March 3, 2025:** Full doc update — all implemented features, APIs, feature flags; paste JD no limit; admin sortable + CSV export.
