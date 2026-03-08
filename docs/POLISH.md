# Product polish (Prompt 9)

Applied Linear/Notion/Vercel-grade polish across the platform.

## Implemented

### 1. Toast system (TASK 4)
- **sonner** installed; **Toaster** in `src/components/ui/Toast.tsx` rendered in root `layout.tsx`.
- Use: `import { toast } from '@/lib/toast'` then `toast.success('Job posted!')`, `toast.error('Failed to save')`, `toast.info('Matching in progress...')`, `toast.loading('Uploading...')`.

### 2. Error & empty states (TASK 2, 3)
- **ErrorState** (`src/components/ui/ErrorState.tsx`): icon, title, message, optional retry button; `role="alert"`, `aria-live="assertive"`.
- **Empty states** (`src/components/ui/EmptyStates.tsx`): EmptyJobsState (optional `postJobHref`), EmptyMatchesState, EmptyApplicationsState, EmptyTeamState, EmptyActivityState, EmptyCompaniesState, EmptyMessagesState, EmptyResumesState, EmptySavedJobsState, EmptyCandidatesState, EmptySkillReportState.
- **Company Jobs** page uses PageLoaderSkeleton, ErrorState, EmptyJobsState with `postJobHref="/dashboard/company/jobs/new"`, card-hover-policy, focus-visible on list links.

### 3. Micro-interactions (TASK 1)
- **globals.css**: `.card-hover-policy` (hover lift + shadow, active reset), `.btn-press-policy` (active scale 0.98), `.focus-border-glow` (focus ring); `prefers-reduced-motion` disables transforms.
- Buttons in design system already use transition and focus-visible ring.

### 4. Page transitions (TASK 5)
- **PageTransition** (`src/components/layout/PageTransition.tsx`): Framer Motion fade + slide (opacity, y).
- **DashboardContent** wraps dashboard main content with PageTransition and **useKeyboardShortcuts**.
- Used in **DashboardLayout** so every dashboard page gets the transition.

### 5. Keyboard shortcuts (TASK 6)
- **useKeyboardShortcuts** (`src/hooks/useKeyboardShortcuts.ts`): Cmd/Ctrl+K focuses first search input; N (no modifier, not in input) → New job on recruiter/company/admin jobs list pages.
- **Esc** closes modals (handled in existing Modal component).
- Hook runs inside DashboardContent (dashboard only).

### 6. Loading states (TASK 1)
- **PageLoaderSkeleton** in `src/components/ui/index.tsx`: `type: 'cards' | 'list' | 'table'` for skeleton grids/rows.
- Company Jobs page uses `PageLoaderSkeleton type="list"` instead of spinner.

### 7. Accessibility (TASK 8)
- ErrorState: role="alert", aria-live="assertive".
- Empty states: role="status", aria-label where appropriate.
- Modal close button: aria-label="Close modal".
- Company Jobs list: role="list", focus-visible ring on links, icon aria-hidden.

### 8. Exports
- From `@/components/ui`: ErrorState, all Empty*State components, Toaster, PageLoaderSkeleton.
- From `@/lib/toast`: toast (sonner).

## Optional next steps

- **Other pages**: Replace raw Spinner full-page with PageLoaderSkeleton where a list/cards layout is known; use ErrorState on error; use Empty*State where lists are empty (e.g. admin jobs, recruiter applications, company team/activity).
- **Global search**: Cmd+K can later open a command palette instead of only focusing search input.
- **Responsive tables**: Convert table to cards on small breakpoints (e.g. company jobs list already uses a list; admin jobs uses table-container).
- **Lighthouse**: Run audit and fix any remaining contrast/bundle/image issues.
- **Typography**: Ensure headings use `font-display` and body uses design tokens (see DESIGN_SYSTEM.md).

## Verification

- Toasts: Call `toast.success('Test')` from any client component.
- Error: Trigger a failing load on Company Jobs (e.g. network off) and retry.
- Empty: Company with no jobs shows EmptyJobsState with Post Your First Job.
- Transition: Navigate between dashboard pages; content fades/slides.
- Shortcuts: On company/recruiter jobs list, press N to go to new job; Cmd+K to focus search if present.
- Reduced motion: Set OS to reduce motion; card hover and button press should not animate.
