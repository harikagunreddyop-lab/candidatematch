# Component structure (target)

Align with `docs/ENTERPRISE_UPGRADE_PLAN.md`:

- **layout/** — Dashboard layout, sidebar, header, content wrapper. Already in use.
- **shared/** — Reusable primitives: `shared/ui` (buttons, cards, inputs, etc.).
- **features/** — Feature-specific components:
  - `features/candidate` — MatchesList, ApplicationsList, DashboardStats, etc.
  - `features/recruiter` — (add as needed)
  - `features/company` — (add as needed)
  - `features/admin` — JobBoardsPanel, etc.

Import from either the legacy path (`@/components/candidate/MatchesList`) or the feature path (`@/components/features/candidate`) — both work. New code should prefer the feature path.
