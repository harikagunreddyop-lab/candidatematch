# CandidateMatch Codebase Audit Report

**Date:** March 3, 2025  
**Scope:** Buttons/actions, failure points, data sync, error surfaces for Candidate and Recruiter dashboards

---

## 1. Buttons and Actions by Role

### 1.1 Candidate Dashboard (`/dashboard/candidate/`)

| Page | Element | Action | API/Supabase |
|------|---------|--------|--------------|
| **page.tsx** | Refresh | `load()` | Supabase: candidates, matches, applications, saved_jobs, reminders; fetch: candidate-resumes, applications/usage |
| **page.tsx** | Export data | `handleExportData()` | `GET /api/candidate-export` |
| **page.tsx** | Apply to job | `applyToJob()` | `POST /api/applications` |
| **page.tsx** | Human review request | `requestHumanReview()` | `POST /api/compliance` |
| **page.tsx** | Save/unsave job | `toggleSavedJob()` | Supabase: candidate_saved_jobs |
| **page.tsx** | Add reminder | `addReminder()` | Supabase: application_reminders |
| **page.tsx** | Remove reminder | `removeReminder()` | Supabase: application_reminders |
| **page.tsx** | Update notes | `updateApplicationNotes()` | Supabase: applications |
| **page.tsx** | Tailor resume | `triggerTailorResume()` | `POST /api/tailor-resume` |
| **page.tsx** | Run ATS check | `runAtsForJob()` | `POST /api/ats/check-batch` |
| **page.tsx** | Paste JD ATS | `runPasteJdAts()` | `POST /api/ats/check-paste` |
| **page.tsx** | Upload resume | `handleUploadResume()` | `POST /api/candidate-resumes` |
| **page.tsx** | Delete resume | `handleDeleteResume()` | `DELETE /api/candidate-resumes` |
| **page.tsx** | Generate job brief | `generateJobBrief()` | `POST /api/candidate-job-brief` |
| **profile/page.tsx** | AI autofill | `handleAutofillWithAI()` | `POST /api/profile/ai-fill` |
| **profile/page.tsx** | Save profile | `saveProfile()` | Supabase: candidates |
| **profile/page.tsx** | Export data | `handleExportData()` | `GET /api/candidate-export` |
| **skill-report/page.tsx** | Generate brief | `generateBrief()` | `POST /api/candidate-job-brief` |
| **reports/page.tsx** | Generate brief | `generateBrief()` | `POST /api/candidate-job-brief` |
| **connect-extension/page.tsx** | Refresh token, Copy | `handleRefresh()`, `handleCopyToken()` | Extension APIs |
| **settings/page.tsx** | Request deletion | `requestDeletion()` | `POST /api/compliance` |
| **settings/page.tsx** | Send password reset | `handleSend()` | Supabase auth |
| **interviews/page.tsx** | Mark as viewed | Auto on load | Supabase: applications |

### 1.2 Recruiter Dashboard (`/dashboard/recruiter/`)

| Page | Element | Action | API/Supabase |
|------|---------|--------|--------------|
| **page.tsx** | Refresh | `load()` | Supabase: assignments, candidates, matches, applications |
| **candidates/page.tsx** | Row click | `router.push(...)` | Navigation only |
| **candidates/[id]/page.tsx** | Save profile | `saveProfile()` | Supabase: candidates |
| **candidates/[id]/page.tsx** | AI autofill | `handleAutofill()` | `POST /api/profile/ai-fill` |
| **candidates/[id]/page.tsx** | Generate resume | `generateResume()` | `POST /api/resumes` |
| **candidates/[id]/page.tsx** | Run ATS batch | `runAtsBatch()` | `POST /api/ats/check-batch` |
| **candidates/[id]/page.tsx** | Paste JD ATS | `runPasteJdAts()` | `POST /api/ats/check-paste` |
| **candidates/[id]/page.tsx** | Apply to job | `applyToJob()` | `POST /api/applications` |
| **candidates/[id]/page.tsx** | Save interview | `saveInterview()` | `PATCH /api/applications` |
| **candidates/[id]/page.tsx** | Upload resume | Form submit | `POST /api/candidate-resumes` |
| **applications/page.tsx** | Status filter | `setStatusFilter()` | Local state |
| **applications/page.tsx** | Update status | `updateStatus()` | `PATCH /api/applications` |
| **applications/page.tsx** | Fetch interview kit | `fetchInterviewKit()` | `POST /api/ats/interview-kit` |
| **applications/page.tsx** | Save interview | `saveInterview()` | `PATCH /api/applications` |
| **pipeline/page.tsx** | Try again | `load()` | Supabase: assignments, applications, matches |
| **pipeline/page.tsx** | Move card | `moveCard()` | `POST` or `PATCH /api/applications` |
| **integrations/page.tsx** | Connect Gmail | `connectGmail()` | Redirect to `/api/integrations/gmail/auth` |
| **integrations/page.tsx** | Sync Gmail | `syncGmail()` | `POST /api/integrations/gmail/sync` |
| **integrations/page.tsx** | Disconnect Gmail | `disconnectGmail()` | `DELETE /api/integrations/gmail/disconnect` |

### 1.3 Admin Dashboard (`/dashboard/admin/`)

| Page | Element | Action | API/Supabase |
|------|---------|--------|--------------|
| **page.tsx** | Refresh | `load()` | Supabase: profiles, candidates, jobs, applications, assignments |
| **AdminDashboardClient.tsx** | Run matching | `runMatching()` | `POST /api/matches` |
| **candidates/page.tsx** | Assign recruiter | `assignRecruiter()` | Supabase: recruiter_candidate_assignments, candidates |
| **candidates/page.tsx** | Remove recruiter | `removeRecruiter()` | Supabase: recruiter_candidate_assignments, candidates |
| **candidates/[id]/page.tsx** | Run matching | `runMatchingForCandidate()` | `GET /api/matches?candidate_id=` |
| **candidates/[id]/page.tsx** | Export | `handleExportCandidate()` | `GET /api/admin/export-candidate` |
| **candidates/[id]/page.tsx** | Assign/remove recruiter | Various | Supabase |
| **applications/page.tsx** | Update status, Save interview | `updateStatus()`, `saveInterview()` | `PATCH /api/applications` |
| **pipeline/page.tsx** | (Same as recruiter pipeline) | | |
| **jobs/page.tsx** | Run matching, Add job, Upload jobs | Various | `POST /api/matches`, Supabase, `POST /api/upload-jobs` |
| **assignments/page.tsx** | Assign | `handleAssign()` | Supabase |
| **users/page.tsx** | Invite, Delete, Save, Send password reset | Various | `POST /api/invite`, `POST /api/admin/send-password-reset`, Supabase |
| *(removed)* `scraping/page.tsx` | Start/Stop scrape, Clear jobs | Feature removed (use Admin Jobs + upload instead) | — |
| **settings/page.tsx** | Save, Rebuild calibration | `save()`, `rebuild()` | Supabase, `POST /api/admin/calibration/rebuild` |
| **compliance/page.tsx** | Approve/Reject/Delete | Various | `POST /api/compliance` |

---

## 2. Identified Bugs and Risks

### 2.1 HIGH IMPACT – User-Facing

#### H-1. Recruiter Applications: Unhandled Promise Rejections
**Location:** `src/app/dashboard/recruiter/applications/page.tsx`  
**Issue:** `updateStatus()` and `saveInterview()` throw on API failure but are called from `onChange`/`onClick` without try/catch.  
**Result:** Unhandled promise rejection; user sees no error message; UI may appear stuck.  
**Conditions:** Network error, 403 (recruiter lost assignment), 404 (application deleted).

#### H-2. Recruiter Pipeline: Silent Failures + No Loading State
**Location:** `src/app/dashboard/recruiter/pipeline/page.tsx`  
**Issue:**
- `moveCard()` logs `console.error` on POST failure but does not surface to user.
- PATCH response is never checked; `load()` runs regardless of success.
- No `moving`/disabled state; user can drag multiple cards during a move.  
**Result:** Failed moves look like success; risk of double-apply or inconsistent state.

#### H-3. Admin Candidates: No Error Handling for Assign/Remove
**Location:** `src/app/dashboard/admin/candidates/page.tsx`  
**Issue:** `assignRecruiter()` and `removeRecruiter()` have no try/catch. Supabase errors are ignored.  
**Result:** User assumes assignment succeeded; RLS or FK errors produce no feedback.

#### H-4. Candidate: Save/Unsave Job, Reminders, Notes – No Error Handling
**Location:** `src/app/dashboard/candidate/page.tsx`  
**Issue:** `toggleSavedJob()`, `addReminder()`, `removeReminder()`, `updateApplicationNotes()` call Supabase without checking `{ error }`.  
**Result:** Optimistic UI update persists even when DB fails; data appears saved but isn’t.

#### H-5. Candidate Dashboard `load()` – No Try/Catch
**Location:** `src/app/dashboard/candidate/page.tsx`  
**Issue:** `load()` has no try/catch. If any `Promise.all` call fails (e.g. fetch JSON parse), `setLoading(false)` may not run.  
**Result:** Spinner never stops; blank/loading screen for user.

#### H-6. Connect Gmail – No Disabled State
**Location:** `src/app/dashboard/recruiter/integrations/page.tsx`  
**Issue:** "Connect Gmail" button has no `disabled` state. User can click multiple times before redirect.  
**Result:** Multiple OAuth flows; possible race conditions or confusing UX.

### 2.2 MEDIUM IMPACT

#### M-1. Admin Dashboard `load()` – No Try/Catch
**Location:** `src/app/dashboard/admin/page.tsx`  
**Issue:** `load()` has no try/catch. Supabase/fetch failures can leave dashboard stuck loading.  
**Result:** Admin dashboard may never finish loading.

#### M-2. Fetch Interview Kit – No Error UX
**Location:** `src/app/dashboard/recruiter/applications/page.tsx`  
**Issue:** `fetchInterviewKit()` sets `interviewKit` only when `res.ok`; no error message or toast on failure.  
**Result:** User sees nothing when AI interview kit fails.

#### M-3. Recruiter Applications `updateStatus` – No Loading per Row
**Location:** `src/app/dashboard/recruiter/applications/page.tsx`  
**Issue:** Status `<select>` has no loading state. User can change status rapidly on multiple rows.  
**Result:** Possible race conditions; unclear which update succeeded.

#### M-4. Export Data – Silent Failure
**Location:** `src/app/dashboard/candidate/page.tsx`  
**Issue:** `handleExportData()` returns early on `!res.ok` with no toast or message.  
**Result:** User clicks Export, nothing happens, no explanation.

#### M-5. Pipeline PATCH Not Awaited
**Location:** `src/app/dashboard/recruiter/pipeline/page.tsx` (lines 138–145)  
**Issue:** `await fetch(..., PATCH)` is missing; `await load()` can run before PATCH completes.  
**Result:** Possible race: `load()` may return stale data before update is visible.

### 2.3 LOWER IMPACT

#### L-1. `req.json().catch(() => ({}))` in API Routes
**Location:** Multiple API routes  
**Issue:** Swallows JSON parse errors; harder to debug malformed requests.  
**Result:** Some 400 responses may lack useful error bodies.

#### L-2. Admin Messages – `console.error` Only
**Location:** `src/app/dashboard/admin/messages/page.tsx`  
**Issue:** `createConversation` errors logged to console only; no user feedback.  
**Result:** User doesn’t know why conversation creation failed.

---

## 3. Data Sync and RLS

### 3.1 Data Flow Summary

| Source | Target | Flow |
|--------|--------|------|
| **profiles** | **candidates** | `user_id` links auth user → candidate row |
| **candidates** | **applications** | `candidate_id`; candidate/recruiter/admin access via RLS |
| **recruiter_candidate_assignments** | **applications**, **candidate_job_matches** | Recruiters only see assigned candidates’ data |
| **applications** | **application_status_history** | Triggered on status change for audit |
| **candidate_resumes** | **resume_versions** | Tailored resumes reference candidate_resumes/jobs |

### 3.2 RLS Policies – Relevant Points

| Table | Candidate | Recruiter | Admin |
|-------|-----------|-----------|-------|
| **profiles** | SELECT all; UPDATE own | Same | Same |
| **candidates** | SELECT own (`user_id`) | ALL (full) | ALL |
| **applications** | SELECT/INSERT/UPDATE own | All for assigned candidates | ALL |
| **recruiter_candidate_assignments** | No access | SELECT/INSERT own; DELETE own | ALL |
| **candidate_job_matches** | SELECT own | ALL | ALL |
| **candidate_resumes** | Full own | Full | Full |
| **resume_versions** | SELECT only | Full | Full |

### 3.3 Potential RLS/Data Sync Issues

1. **Recruiter loses assignment mid-session:** If a recruiter’s assignment is removed while they have the candidate page open, subsequent PATCH `/api/applications` will return 403. Client currently doesn’t surface this clearly (see H-1).
2. **Candidate row vs profile:** `candidates.user_id` must match `profiles.id`. `auth/complete` and invite flows create/link these; orphaned `profiles` with no `candidates` row can lead to “not linked” state.
3. **Real-time subscriptions:** Pipeline and dashboards use Supabase realtime. RLS applies to changed rows; if RLS blocks, the client won’t receive those events, which can cause perceived staleness.

---

## 4. Error Surfaces Summary

| Category | Findings |
|----------|----------|
| **Unhandled rejections** | Recruiter applications `updateStatus`/`saveInterview`; Admin applications same pattern |
| **Console-only errors** | Pipeline move failure; admin messages `createConversation`; Gmail callback; tailor-resume API |
| **Missing loading states** | Pipeline drag; Connect Gmail; Recruiter applications status select |
| **Missing disabled states** | Connect Gmail (double-click); some secondary actions |
| **Silent failures** | Candidate save/unsave, reminders, notes; Admin assign/remove; Export data |

---

## 5. Recommended Fixes (Priority Order)

### High Priority

1. **Recruiter applications**  
   Wrap `updateStatus` and `saveInterview` in try/catch; show toast or inline error. Add per-row loading state for status changes.

2. **Recruiter pipeline**  
   - Add `movingCardId` state and disable drag/drop during move.  
   - Check PATCH response; show toast on failure.  
   - Await PATCH before calling `load()`.

3. **Admin candidates**  
   Add try/catch to `assignRecruiter` and `removeRecruiter`; check Supabase `{ error }`; show error toast and revert optimistic UI on failure.

4. **Candidate save/unsave, reminders, notes**  
   Check Supabase `{ error }` in `toggleSavedJob`, `addReminder`, `removeReminder`, `updateApplicationNotes`; revert optimistic state and show toast on error.

5. **Candidate dashboard load**  
   Wrap `load()` in try/catch; call `setLoading(false)` in `finally`; set `loadError` state and show “Try again” on failure.

6. **Connect Gmail**  
   Add `connecting` state; disable button with `disabled={connecting}` during redirect.

### Medium Priority

7. **Admin dashboard load** – Add try/catch and error UI.  
8. **Fetch interview kit** – Show toast/error on failure.  
9. **Export data** – Show toast on `!res.ok`.  
10. **Pipeline PATCH** – Add `await` before `load()`.

### Lower Priority

11. Use a shared `apiFetch` helper that parses JSON and surfaces errors consistently.  
12. Replace `req.json().catch(() => ({}))` with explicit error handling in critical routes.  
13. Add integration tests for assign/remove, pipeline move, and application status updates.

---

## Appendix: API Routes Error Handling

| Route | Error handling |
|-------|----------------|
| `/api/applications` | Returns 400/403 with `{ error }`; client must check `res.ok` |
| `/api/candidate-resumes` | Returns error body; logs storage/DB failures |
| `/api/tailor-resume` | Catches and logs; returns 500 |
| `/api/ats/*` | Various; some catch and return error body |
| `/api/compliance` | Returns error body |
| `/api/integrations/gmail/*` | Returns error body; callback logs to console |

Most routes return structured errors; the main gaps are on the **client** (missing checks and user feedback).
