# Platform Admin Jobs Audit

## Scope

- `src/app/dashboard/admin/jobs/page.tsx`
- `src/app/api/admin/jobs/route.ts`
- `src/app/api/upload-jobs/route.ts`
- `src/app/api/matches/route.ts`
- `src/components/admin/JobBoardsPanel.tsx`

## Findings

### Security and access control

- `AddJobForm` wrote directly to `jobs` from browser client, bypassing API-level validation/audit.
- Admin mutations were protected with `requireAdmin` in route handlers, but audit events were not consistently emitted.

### Data integrity and correctness

- Jobs listing API used `select('*')` with client-side search against one page only.
- Manual job creation dedupe hash was weak (`btoa(...).slice(0, 32)`), increasing collision risk.
- Filtering/search behavior was split across server and client, producing inconsistent total counts.

### Performance and scalability

- Admin jobs page polled every 10s while also using realtime subscription.
- Exact count query executed on each load and broad payload fields were returned.

### UX and reliability

- `any`-heavy state made edge case handling fragile for long-running operations.
- Search input did not reflect server truth and pagination count under search scenarios.

### Observability and auditability

- Missing consistent structured logs and audit rows for key actions:
  - manual job creation
  - upload jobs outcome
  - matching trigger
  - jobs fetch failures

### Tests

- No route tests for `/api/admin/jobs` or `/api/upload-jobs`.

## Enterprise hardening checklist

- [x] Remove client-side privileged writes.
- [x] Enforce server validation for manual job creation.
- [x] Add server-side search + filter + pagination contract.
- [x] Narrow selected columns for job listing payload.
- [x] Emit audit and structured logs for high-impact admin actions.
- [x] Add API tests for auth, validation, and success paths.
- [x] Validate with type-check/lint/tests for touched scope.
