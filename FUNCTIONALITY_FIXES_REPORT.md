# Functionality Fixes Report — Candidatematch

**Status:** Major items (API auth, recruiter nav, error states, middleware, invite-only flow) have been implemented. A deep debug pass has been run: build passes, type errors fixed, and consistency checks done.  
**Scope:** Auth, API security, UX (errors/navigation), and data-layer consistency.

---

## 1. API routes without authentication (High)

These API routes use the **service client only** and do **not** verify the caller. Anyone who can reach your domain can call them.

| Route | Methods | Risk |
|-------|---------|------|
| `POST/ PATCH /api/applications` | Create/update applications | Anyone can create or change applications |
| `GET/ POST /api/matches` | Run/read matching | Anyone can trigger matching or read results |
| `GET/ POST /api/scraping` | Run scrapes, read history | Anyone can trigger scrapes |
| `POST /api/upload-jobs` | Upload jobs CSV | Anyone can upload jobs |
| `POST /api/candidate-brief` | Generate brief for `candidate_id` | Anyone can request briefs for any candidate |
| `GET /api/candidate-resumes` | Resumes for candidate | Should be restricted to candidate/recruiter/admin |
| `POST /api/resumes` (and variants) | Resume operations | Should verify auth/role |
| `POST /api/recruiter-ai` | Recruiter AI | Should be recruiter or admin only |

**Fix:** For each route, add auth using the **server Supabase client** (cookies) or a validated Bearer token, then:

- **applications:** Allow only authenticated user; restrict create/update by role (candidate for own apply, recruiter/admin for status/notes).
- **matches:** Allow only admin (or recruiter for assigned candidates) for POST; GET by role.
- **scraping, upload-jobs:** Admin only.
- **candidate-brief, candidate-resumes, resumes:** Ensure caller is the candidate, or recruiter/admin for that candidate.
- **recruiter-ai:** Recruiter or admin only.

Use the same pattern as `GET /api/admin/export-candidate` and `GET /api/candidate-export`: create server client from request cookies, `getUser()`, then optionally load profile and check `role`.

---

## 2. Recruiter Pipeline missing from sidebar (Medium)

- **What:** The recruiter pipeline page exists at **`/dashboard/recruiter/pipeline`** and works, but there is **no “Pipeline” link** in the recruiter sidebar.
- **Where:** `src/components/layout/DashboardLayout.tsx` — `recruiterNav` has only Dashboard, Candidates, Applications, Messages.
- **Fix:** Add a nav item to `recruiterNav`, e.g.  
  `{ label: 'Pipeline', href: '/dashboard/recruiter/pipeline', icon: <Cpu size={18} /> }`  
  (reuse the same icon as admin Pipeline if desired).

---

## 3. User-visible error handling (Medium)

When Supabase (or a fetch) fails, these pages do not show a clear error message; they show empty state or nothing.

| Page | Issue |
|------|--------|
| **Admin Audit** (`/dashboard/admin/audit`) | `const { data } = await supabase...` — `error` is never checked. On failure, UI shows “No audit entries” instead of “Failed to load”. |
| **Admin Reports** (`/dashboard/admin/reports`) | Multiple Supabase calls; no shared error state or user-visible “Failed to load reports” message. |
| **Admin Assignments** (`/dashboard/admin/assignments`) | Load failure does not set a user-visible error (only form/validation errors are shown). |
| **Recruiter Pipeline** | If session is missing or fetch fails, no user-visible error message. |
| **Admin Messages** | Errors are logged to console (e.g. load conversations, create conversation) but not always surfaced in the UI. |

**Fix (pattern):**

- Destructure `error` from Supabase responses (e.g. `const { data, error } = await supabase...`).
- Maintain an `error` state (e.g. `loadError` or `error`) and set it when `error` is truthy.
- In the UI: if `error` is set, show a clear message (e.g. “Failed to load. Please try again.”) and optionally a retry button; do not show “No data” when the reason is a failed request.

---

## 4. Middleware: logged-in user with no profile/role (Medium)

- **What:** If a user is logged in (valid session) but the **profiles** row is missing or the middleware’s `profiles` select fails (e.g. RLS or DB issue), `role` is `undefined`. The user then stays on the login page (`/`) with no explanation.
- **Where:** `src/middleware.ts` — after `supabase.from('profiles').select('role').eq('id', user.id).single()`, there is no handling for missing/failed profile.
- **Fix:**  
  - If profile fetch fails or `profile`/`role` is missing, redirect to a dedicated route (e.g. `/pending-approval` or `/auth/complete-profile`) that explains “Your account is being set up” or “Contact admin for access”, instead of leaving them on `/`.  
  - Optionally log the case (e.g. “User has session but no profile/role”) for debugging.

---

## 5. requireRole not used (Low)

- **What:** `requireRole(roles)` exists in `src/lib/auth.ts` but is **not used** anywhere. All role enforcement is in middleware.
- **Fix:** Either use `requireRole` in layout(s) or route handlers where you want an extra server-side check (e.g. admin-only layout), or leave as-is and rely on middleware only. If you add API auth (see §1), you will be doing role checks there instead, so this is optional.

---

## 6. Audit log from server (Low)

- **What:** `lib/audit.ts` uses the **browser** Supabase client. It’s correct when called from client components (e.g. assignments page). If you ever need to write audit logs from **server** code (e.g. API routes, server actions), that would use the wrong client.
- **Fix:** When you add server-side audit, introduce a server-side logger (e.g. `logAuditServer`) that uses `createServerSupabase()` or `createServiceClient()` and call it from API routes/server actions; keep the existing client `logAudit` for client-side actions.

---

## 7. Candidate export API (Verification)

- **What:** `GET /api/candidate-export` already checks auth and that the user is the candidate (via `candidates.user_id`). No change required; just confirm that only the owning candidate (or admin, if you add that) can export.

---

## Summary checklist

| # | Fix | Priority |
|---|-----|----------|
| 1 | Add auth (and role where needed) to: applications, matches, scraping, upload-jobs, candidate-brief, candidate-resumes, resumes, recruiter-ai | **High** |
| 2 | Add “Pipeline” to recruiter sidebar in `DashboardLayout.tsx` | **Medium** |
| 3 | Add user-visible error state and message on load failure: Audit, Reports, Assignments, Recruiter Pipeline, Admin Messages | **Medium** |
| 4 | In middleware, handle missing profile/role (redirect + optional message page) | **Medium** |
| 5 | Use or remove `requireRole`; optional for consistency | **Low** |
| 6 | When adding server-side audit, use server/service client in a dedicated helper | **Low** |
| 7 | Confirm candidate-export is only for the candidate (and optionally admin) | **Verify** |

You can tackle these in the order above; start with §1 (API auth) and §2 (Pipeline nav), then §3 and §4 for better UX and security.

---

## 8. Session fixes (Feb 2025)

### Implemented

- **Dark / light mode text contrast**  
  - `globals.css`: Stronger overrides for `text-surface-400/500` in light mode (darker gray for readability on white).  
  - Dark mode: `.label`, `.table-container th`, `.tab-inactive`, and `text-surface-200` use higher-contrast colors so text does not blend into the background.

- **Resume generation access control**  
  - New column `profiles.resume_generation_allowed` (migration `006_resume_generation_access.sql`).  
  - Only **recruiters** with this flag set to `true` can call the resume generation API; admins can always call it.  
  - Admin **Users & Recruiters** → Edit a recruiter → toggle **“Resume generation allowed”**.  
  - API `POST /api/resumes` (JSON mode): recruiters are rejected with 403 if `resume_generation_allowed` is not true.

- **Resume generation only for score &lt; 75**  
  - API enforces: resume generation is only allowed when the candidate–job match has `fit_score < 75`.  
  - Recruiter and admin candidate detail UIs: “Generate Resume” is disabled (with tooltip) for matches with score ≥ 75.

- **Recruiters can see job descriptions**  
  - Recruiter candidate detail → **Matching Jobs**: each match shows a **“View job description”** link that opens a modal with the job’s description (`jd_clean` or `jd_raw`).

- **Worker auto-start (development only)**  
  - When `POST /api/resumes` (generate) is called and the resume worker health check fails, in **development** the API attempts to spawn the worker process once and retries the health check after 3s.  
  - In production, the worker must be run separately (e.g. `npm run worker:dev` or a separate process/container).

### Remaining / known issues

- **Resume worker must be running for generation to succeed**  
  - In production, ensure the worker is started (e.g. systemd, Docker, or separate Node process). The app does not start the worker in production.

- **API routes still unauthenticated (see §1)**  
  - The report’s §1 still applies: several routes (matches, scraping, upload-jobs, etc.) should enforce auth/role if not already done.

- **Recruiter “Generate Resume” without access**  
  - If a recruiter does not have “Resume generation allowed”, the button is disabled with tooltip “Ask an admin to grant resume generation access”. The API also returns 403 with a clear message.
