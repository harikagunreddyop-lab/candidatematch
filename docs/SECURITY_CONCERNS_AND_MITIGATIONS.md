# Security Concerns and Mitigations

This document summarizes security findings and mitigations implemented for the CandidateMatch application.

## High Priority

### 1. Rate limiting

**Concern:** No rate limiting on auth or API endpoints allowed brute force and abuse.

**Mitigation:**
- Added `src/lib/rate-limit.ts` with in-memory rate limiting
- Presets: `auth` (10/min), `api` (120/min)
- Applied to: applications POST, ATS check, tailor-resume (GET/POST), invite, autofill-profile GET

### 2. CRON_SECRET timing attack

**Concern:** Direct string comparison for `CRON_SECRET` leaked timing information.

**Mitigation:**
- `src/lib/security.ts` – `validateCronAuth(req)` uses `crypto.timingSafeEqual`
- `src/app/api/cron/match/route.ts` and `src/app/api/cron/cleanup/route.ts` use `validateCronAuth()`

### 3. Row Level Security (RLS)

**Concern:** Several tables had no RLS or overly permissive policies.

**Mitigation:**
- `supabase/migrations/025_security_hardening.sql` – RLS for:
  - `human_review_requests` – candidate owns requests; admin/recruiter read
  - `scrape_runs`, `cron_run_history`, `scoring_runs`, `calibration_curves` – admin only
  - `resume_embeddings` – admin/recruiter only
  - `admin_notifications` – admin only
  - `user_presence` – own row only

---

## Medium Priority

### 4. CORS on autofill

**Concern:** `Access-Control-Allow-Origin: *` on autofill allowed any origin.

**Mitigation:**
- `AUTOFILL_ALLOWED_ORIGINS` env – comma-separated origins
- When set, only those origins receive CORS; otherwise falls back to `*` for compatibility

### 5. Input validation

**Concern:** UUIDs and other inputs not validated, enabling injection and malformed requests.

**Mitigation:**
- `src/lib/security.ts` – `isValidUuid()`, `sanitizeString()`, `parseJsonBody()`
- Applied UUID validation to: applications (candidate_id, job_id), ATS check, tailor-resume, autofill-profile (candidate_id)

### 6. Security headers

**Concern:** Missing standard security headers.

**Mitigation:**
- `next.config.js`:
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`

---

## Low Priority / Informational

### 7. Profiles RLS

**Info:** `profiles_select` uses `USING (TRUE)` – all authenticated users can read all profiles. This may be intentional for directory/recruiter views. Consider tightening if profile data is sensitive.

### 8. Token in DOM

**Info:** Supabase anon key is exposed in client bundles (expected for Supabase). Ensure RLS and auth policies limit access; do not store service role key client-side.

### 9. Extension / third-party

**Info:** Browser extensions may store the anon key. Risk is low if RLS is correct; avoid storing secrets in extensions.

---

## Environment variables

| Variable | Purpose |
|----------|---------|
| `CRON_SECRET` | Required for cron endpoints; use `validateCronAuth()` |
| `AUTOFILL_ALLOWED_ORIGINS` | Optional; comma-separated origins for autofill CORS (e.g. `https://app.example.com`) |

---

## Deployment checklist

1. Set `CRON_SECRET` to a strong random value
2. Set `AUTOFILL_ALLOWED_ORIGINS` if autofill is used from specific domains
3. Run `supabase/migrations/025_security_hardening.sql` if not already applied
4. Run `npm audit` and address critical/high findings
5. Ensure no service role key or other secrets are in client code or env vars prefixed with `NEXT_PUBLIC_`
