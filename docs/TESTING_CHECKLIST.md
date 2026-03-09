# Testing Checklist

Complete testing coverage for CandidateMatch: unit, integration, E2E, performance, and accessibility.

## Commands

| Command | Description |
|--------|-------------|
| `npm test` | Run all Vitest unit/integration tests |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run test:coverage` | Vitest with coverage report |
| `npm run test:integration` | Run only API route integration tests |
| `npm run test:e2e` | Playwright E2E tests (starts dev server if needed) |
| `npm run test:e2e:ui` | Playwright UI mode |
| `npm run test:perf` | Performance benchmarks |
| `npm run test:a11y` | Accessibility (axe) tests |
| `npm run test:all` | Unit + E2E |

## Checklist

### Unit tests (Vitest)
- [x] Match scoring: `src/lib/scoring.test.ts` — skill match, missing skills penalty, ATS formatting
- [x] ATS scorer v2: `src/lib/ats-scorer-v2.test.ts` — evidence, gates, bands
- [ ] Unit tests for all other utility functions in `src/lib/` (sanitize, validation, errors, etc.)

### Integration tests (Vitest + mocks)
- [x] POST /api/companies/jobs — create job, auth required, title required
- [ ] Integration tests for all other API routes (GET/POST per route as needed)

### E2E tests (Playwright)
- [x] Candidate application flow: login → jobs → search → apply (optional selectors)
- [x] Jobs page loads
- [x] Duplicate application prevention (Already Applied)
- [ ] Recruiter flows (pipeline, candidates)
- [ ] Company admin flows (team, analytics)

### Performance
- [x] Dashboard load &lt; 5s
- [x] Job search response &lt; 5s
- [ ] Load testing (concurrent users) — e.g. k6 or Artillery
- [ ] Lighthouse CI in pipeline (optional)

### Accessibility (WCAG 2.1 AA)
- [x] axe-core on candidate dashboard and login page
- [x] Keyboard navigability (Tab, Enter/Space)
- [ ] Mobile responsiveness tests (viewport)
- [ ] Full WCAG 2.1 AA audit on critical pages

### Cross-browser
- [x] Playwright projects: Chromium, Firefox, WebKit
- [ ] Optional: real Safari/Edge in CI matrix

### Security
- [ ] Penetration testing (e.g. OWASP ZAP or manual)
- [ ] Auth/session tests (CSRF, token expiry)

## Adding tests

1. **Unit**: Add `*.test.ts` next to the module (e.g. `src/lib/foo.test.ts`). Use `describe`/`it`/`expect` from `vitest`.
2. **Integration**: Add `route.test.ts` in the same directory as the route. Mock `@/lib/api-auth`, `@/lib/supabase-server`, and other side effects with `vi.mock()`.
3. **E2E**: Add `*.spec.ts` under `tests/e2e/`. Use `@playwright/test`; selectors should be resilient (role, placeholder, data attributes).
4. **A11y**: Add specs under `tests/a11y/`. Use `@axe-core/playwright` and `AxeBuilder` with tags `wcag2a`, `wcag2aa`.

## CI

- Run `npm test` and `npm run test:coverage` on every PR.
- Run `npm run test:e2e` (and optionally `test:perf`, `test:a11y`) on main or nightly. Ensure `PLAYWRIGHT_BASE_URL` or start the app before E2E.

## First-time E2E setup

Install Playwright browsers (one-time):

```bash
npx playwright install
```
