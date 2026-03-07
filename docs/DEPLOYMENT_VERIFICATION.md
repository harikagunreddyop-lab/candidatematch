# Deployment Verification Checklist

Use this after deploying to AWS Amplify (or any host) to confirm the app is production-ready.

---

## 1. Build & Deploy

- [ ] `npm run build` succeeds locally.
- [ ] Amplify build completes (or your CI/CD pipeline).
- [ ] No missing env vars at build time (see Amplify console / `amplify.yml`).

---

## 2. Environment Variables

Ensure these are set in Amplify (or your host):

| Variable | Required | Notes |
|----------|----------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Server-only |
| `NEXT_PUBLIC_APP_URL` | ✅ | App URL (e.g. `https://master.xxx.amplifyapp.com`) |
| `ANTHROPIC_API_KEY` | ✅ | For AI/matching features |
| `CRON_SECRET` | If using cron | For `/api/cron/*` and GitHub Actions |
| `NEXT_PUBLIC_SENTRY_DSN` | Optional | Error tracking |
| `REDIS_URL` | Optional | BullMQ / rate limit when set |

---

## 3. Health & Critical Routes

- [ ] **GET /api/health** returns `200` and `"status": "healthy"` or `"degraded"` (DB up; Redis optional).
- [ ] **GET /** loads the landing/marketing page.
- [ ] **GET /auth** loads sign-in (redirects when already logged in).
- [ ] **GET /dashboard** redirects to role-specific dashboard when authenticated.

---

## 4. Auth & RBAC

- [ ] Sign-in (email/password or OAuth) works.
- [ ] Candidate sees `/dashboard/candidate`.
- [ ] Company admin sees `/dashboard/company`.
- [ ] Platform admin sees `/dashboard/admin`.
- [ ] Unauthenticated access to `/dashboard` redirects to `/auth`.

---

## 5. Cron (Optional)

If using EventBridge or GitHub Actions:

- [ ] **GET /api/cron/ingest** with `Authorization: Bearer <CRON_SECRET>` returns 200.
- [ ] **GET /api/cron/match** with same header returns 200.
- [ ] **GET /api/cron/cleanup** with same header returns 200.
- [ ] Without valid `CRON_SECRET`, endpoints return 401.

---

## 6. Extension & Autofill

- [ ] **GET /connect-extension** (or `/dashboard/candidate/connect-extension`) loads for candidates.
- [ ] Non-candidates are redirected away from connect-extension.
- [ ] **GET /api/autofill-profile** with valid candidate JWT returns profile (or 401).

---

## 7. Security Headers

- [ ] Response headers include `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` (from Next.js config or `public/_headers` if supported).

---

## 8. Post-Deploy Smoke Test

```bash
# Health
curl -s https://<your-app>/api/health | jq .

# Cron (replace secret and URL)
curl -s -H "Authorization: Bearer YOUR_CRON_SECRET" https://<your-app>/api/cron/ingest | jq .
```

---

## 9. Sentry (Optional)

- [ ] `NEXT_PUBLIC_SENTRY_DSN` set in Amplify.
- [ ] Trigger a test error; event appears in Sentry project.

---

## 10. GitHub Actions (Optional)

- [ ] Repo secrets: `CRON_SECRET`.
- [ ] Repo variable: `APP_URL` (or workflows use default).
- [ ] Workflow **Job Ingestion Cron** runs on schedule or `workflow_dispatch`.
- [ ] Workflow **Health Check** runs on schedule or `workflow_dispatch`.

---

**Sign-off:** _________________ Date: _________
