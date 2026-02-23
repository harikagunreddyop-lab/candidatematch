# User Authentication Process

## Overview

Authentication uses **Supabase Auth** with:
- **Email/password** (login, signup, forgot password)
- **OAuth** (Google, LinkedIn)
- **Magic-link invite** (candidates: admin sends invite, user sets password via email)

Session is stored in **cookies** and validated in **middleware** and **API routes**.

---

## 1. Entry Points

| Flow | Entry | File |
|------|--------|------|
| Login / Signup | `/` (home) | `src/app/page.tsx` |
| Auth callback (OAuth, magic link, recovery) | `/auth/callback` | `src/app/auth/callback/route.ts` |
| Set new password (recovery) | `/auth/reset-password` | `src/app/auth/reset-password/page.tsx` |
| Pending approval (no role yet) | `/pending-approval` | `src/app/pending-approval/page.tsx` |

---

## 2. Login Flow (Email)

1. User submits email + password on `/` → `supabase.auth.signInWithPassword({ email, password })`.
2. On success → redirect to `window.location.href = '/dashboard'`.
3. **Middleware** runs on `/dashboard`:
   - Uses `createServerClient` (from `@supabase/ssr`) with request cookies.
   - Calls **`supabase.auth.getUser()`** (validates JWT with Supabase Auth server).
   - If no user → redirect to `/`.
   - If user → loads `profiles.role` for `user.id`.
   - If no profile/role → redirect to `/pending-approval`.
   - If has role → redirect `/dashboard` → role dashboard (`/dashboard/admin`, `/dashboard/recruiter`, or `/dashboard/candidate`).

---

## 3. OAuth Flow (Google / LinkedIn)

1. User clicks "Continue with Google" or LinkedIn → `supabase.auth.signInWithOAuth({ provider, options: { redirectTo: origin + '/auth/callback' } })`.
2. Browser redirects to provider; after consent, Supabase redirects to `/auth/callback?code=...`.
3. **Auth callback** (`GET /auth/callback`):
   - `createServerSupabase()` (reads/writes cookies via `next/headers`).
   - `supabase.auth.exchangeCodeForSession(code)` → stores session in cookies.
   - If `type=recovery` → redirect to `/auth/reset-password`.
   - Else loads `profiles.role` for the user and redirects to the correct dashboard (admin / recruiter / candidate).

---

## 4. Invite Flow (Candidates)

1. Admin sends invite from **Users** → **Invite User** (role = candidate, email, optional name/phone).
2. **POST /api/invite** (admin-only):
   - `auth.admin.inviteUserByEmail(email, { redirectTo, data: { role, name } })`.
   - Creates `profiles` and `candidates` rows (name, email, phone, role).
3. User receives email with magic link → clicks → Supabase redirects to `/auth/callback?code=...`.
4. Callback exchanges code for session; profile already exists (role = candidate) → redirect to `/dashboard/candidate`.
5. **Middleware** then enforces **candidate access**:
   - If candidate has **no** `recruiter_candidate_assignments` → redirect to `/dashboard/candidate/waiting`.
   - If candidate **has** assignment → allow full `/dashboard/candidate/*` (except waiting).

---

## 5. Forgot Password (Self-Service)

1. On `/`, user clicks "Forgot password?" → mode `forgot`.
2. Submits email → `supabase.auth.resetPasswordForEmail(email, { redirectTo: origin + '/auth/callback?type=recovery' })`.
3. User gets email → clicks link → `/auth/callback?code=...&type=recovery` → redirect to `/auth/reset-password`.
4. Reset page: user sets new password → `supabase.auth.updateUser({ password })` → redirect to `/dashboard`.

**Admin-triggered reset:** Admin can send password reset from Edit User (candidate) → **POST /api/admin/send-password-reset** (admin-only) → same recovery flow.

---

## 6. Middleware (Route Protection)

**File:** `src/middleware.ts`  
**Matcher:** `['/', '/dashboard/:path*', '/pending-approval']` (so `/auth/callback` and `/auth/reset-password` are not run through middleware).

- **No user** on `/dashboard` or `/pending-approval` → redirect to `/`.
- **User but no profile/role** on `/` or `/dashboard` → redirect to `/pending-approval`.
- **User with role** on `/pending-approval` → redirect to role dashboard.
- **User on `/`** → redirect to role dashboard.
- **Role vs route:**
  - `/dashboard/admin` → only `admin`
  - `/dashboard/recruiter` → `recruiter`, `admin`
  - `/dashboard/candidate` → `candidate`, `admin`
- **Candidate-specific:** Full candidate dashboard only if `candidates` row exists and at least one `recruiter_candidate_assignments`; otherwise redirect to `/dashboard/candidate/waiting`.

---

## 7. Server-Side Auth (Layout & API)

- **Dashboard layout** (`src/app/dashboard/layout.tsx`): Uses `requireAuth()` from `src/lib/auth.ts` → `getProfile()` → redirect to `/` if no profile. So dashboard pages are protected by both middleware and layout.
- **Auth helpers** (`src/lib/auth.ts`): `getSession()`, `getProfile()`, `requireAuth()`, `requireRole()`. Use **`getUser()`** (not `getSession()`) for server-side checks so the JWT is validated with Supabase.
- **API routes** (`src/lib/api-auth.ts`): `requireApiAuth(req, { roles? })`, `requireAdmin(req)`, `requireRecruiterOrAdmin(req)`. Use `createServerSupabaseFromRequest(req)` and **`getUser()`**; then load `profiles` and enforce role.

---

## 8. Profile Creation (New Users)

- **DB trigger:** `handle_new_user()` on `auth.users` AFTER INSERT:
  - Inserts into `profiles(id, name, email, role)`.
  - `role` from `raw_user_meta_data->>'role'` (invite sets this; signup can pass `signup_role` in options).
  - Name from `full_name` / `name` / email prefix.
- **Invite flow** also upserts `profiles` and `candidates` in **POST /api/invite** so the profile exists before the user clicks the magic link.

---

## 9. Summary Diagram

```
[ / ]  Login/Signup/Forgot
   │
   ├─ signInWithPassword ──► session in cookies ──► redirect /dashboard
   ├─ signInWithOAuth ──► redirect to provider ──► /auth/callback?code=... ──► exchangeCodeForSession ──► redirect by role
   └─ resetPasswordForEmail ──► email link ──► /auth/callback?type=recovery ──► /auth/reset-password

Middleware on / and /dashboard and /pending-approval:
   getUser() from cookies ──► no user? redirect /
   profile.role? no ──► redirect /pending-approval
   role yes ──► allow dashboard by ROLE_ROUTES; candidate: also check recruiter_candidate_assignments
```

---

## 10. Security Notes

- **Middleware** and **API auth** use **`getUser()`** to validate the JWT with Supabase (recommended).
- **Server components / layout** should use **`getUser()`** (or profile fetch after getUser) rather than `getSession()` only, so server-side checks are validated.
- Cookies are managed by `@supabase/ssr` (middleware) and `next/headers` (Route Handlers / server components).
- Invite and admin password reset require **admin** role; enforced in API via `requireAdmin()` or profile.role check.
