# CandidateMatch UI Roadmap — Minimal to Elite (25-Year Vision)

**Date:** March 3, 2025  
**Scope:** UI/UX improvements and feature enhancements — from minimal polish to 25-year future vision.  
**Includes:** Paste JD + ATS check feature for candidates and recruiters.

---

## Paste Job Description → ATS Check (New Feature)

**Description:** Candidates and recruiters can paste any job description (from LinkedIn, Indeed, company site, etc.) and instantly check their ATS score against their available resumes — without needing the job to exist in CandidateMatch.

| Aspect | Details |
|--------|---------|
| **Who** | Candidates (own resumes), Recruiters (candidate's resumes) |
| **Flow** | Paste JD in textarea → Select resume(s) or "use best" → Run ATS → Get score + breakdown |
| **Output** | ATS score, dimension breakdown, matched/missing keywords, fix suggestions |
| **Storage** | Optional: save as ad-hoc "Job" for history; or ephemeral (no persist) |
| **API** | New `POST /api/ats/check-paste` — accepts `jd_text`, `candidate_id`, `resume_id?` |
| **UI** | "Check ATS for pasted JD" card or modal on candidate dashboard + recruiter candidate view |
| **Impact** | Enables testing fit for jobs outside the system; faster feedback loop |

---

## 1. Minimal (Quick wins, accessibility, consistency)

| Area | Improvement | Impact |
|------|-------------|--------|
| **ATS score bands** | Consistent color semantics: 80+ green, 61–79 amber, ≤60 red | Clarity |
| **Apply/tailor gating** | Clear messages per band: "Below 60 — cannot apply or tailor", "Tailor first to reach 80+", "Run ATS check first" | Compliance, clarity |
| **Score badges** | Same thresholds (80/61) in candidate, recruiter, admin views | Consistency |
| **Empty states** | Short, actionable copy with primary CTA on every empty list | Onboarding |
| **Loading states** | Spinner + skeleton for lists (matches, applications, pipeline) | Perceived performance |
| **Error messages** | User-facing error copy instead of raw API errors | Trust |
| **Form labels** | Explicit `label` elements, `aria-describedby` for hints | A11y |
| **Focus management** | Focus trap in modals, return focus on close | A11y |
| **Keyboard** | Escape closes modals, Tab order logical | A11y |
| **Responsive** | Breakpoints for job cards, tables, modals on small screens | Mobile |

---

## 2. Standard (Good UX, feedback, hierarchy)

| Area | Improvement | Impact |
|------|-------------|--------|
| **Job cards** | Clear hierarchy: title → company → meta (ATS, salary, location) → actions | Scanability |
| **ATS breakdown** | Collapsible by default, expand on click; summary visible without expand | Progressive disclosure |
| **Tailor progress** | Status text: "Generating… (30–60 sec)" plus optional progress steps | Expectation setting |
| **Apply flow** | Resume picker with preview; inline validation before submit | Confidence |
| **Pipeline view** | Column headers with counts; drag-drop feedback on status change | Recruiter efficiency |
| **Recruiter candidate** | Quick actions (Email, Brief, Resume, ATS) visually grouped | Workflow |
| **Search/filter** | Persist filters in URL; "Clear filters" when active | Navigation |
| **Date range** | Preset ranges (7d, 30d, 90d) for matches/applications | Convenience |
| **Toast** | Success/error toasts with auto-dismiss; action undo where possible | Feedback |
| **Tables** | Sortable headers, pagination for long lists (admin jobs, candidates) | Scale |

---

## 3. Advanced (Polish, personalization, clarity)

| Area | Improvement | Impact |
|------|-------------|--------|
| **ATS score tooltip** | Hover shows band explanation: "80+ = apply ready", "61–79 = tailor first", etc. | Education |
| **Skill report** | Visual skill heatmap, gap analysis vs. target roles | Candidate growth |
| **Match explanation** | "Why you match" short bullet; expand for full reason | Trust |
| **Calibration badge** | When `p_interview` exists: "~X% interview chance" with tooltip | Context |
| **Per-resume scores** | Show which resume scored best; recommendation to use tailored | Guidance |
| **Job age badge** | "New", "1 week", "2 weeks+" with distinct styling | Urgency |
| **Saved jobs** | Same apply/tailor rules and ATS badge as My Jobs | Consistency |
| **Recruiter override** | When recruiter confirms applied despite low score: "override" badge in audit | Transparency |
| **Tailor CTA** | After tailor completes: "Run ATS to see new score" prompt | Conversion |
| **Onboarding** | Short checklist: "Upload resume", "Run ATS", "Apply to first job" | Activation |

---

## 4. Elite (Premium experience, delight)

| Area | Improvement | Impact |
|------|-------------|--------|
| **Animations** | Subtle transitions: card hover, modal enter/exit, list reorder | Polish |
| **Micro-interactions** | Button press feedback, success checkmark animation | Delight |
| **ATS dimension chart** | Radial or bar chart for dimension scores | Visual understanding |
| **Interview prep** | AI-generated prep tips per application (status = interview) | Value-add |
| **Resume diff** | Side-by-side: original vs tailored bullets | Transparency |
| **Gamification** | Streaks, milestones: "5 applications this week", "First interview" | Engagement |
| **Personalized dashboard** | "Recommended for you" based on skills + past applications | Personalization |
| **Dark mode** | Full dark theme with proper contrast | Accessibility |
| **Real-time updates** | Live status changes via Supabase realtime | Responsiveness |
| **Command palette** | Cmd+K: quick search jobs, candidates, navigate | Power users |
| **Bulk actions** | Multi-select apply, archive, export | Efficiency |
| **Export** | CSV/PDF export for pipeline, applications, reports | Reporting |

---

## 5. Accessibility & Inclusion (Evergreen)

| Area | Improvement | Impact |
|------|-------------|--------|
| **WCAG 3.0** | Contrast, focus, motion preferences | Compliance |
| **Screen reader** | Landmarks, live regions, semantic HTML | A11y |
| **Keyboard-first** | All flows completable via keyboard | A11y |
| **Cognitive accessibility** | Plain language, consistent patterns, optional simple mode | Inclusion |
| **Dyslexia-friendly fonts** | Optional OpenDyslexic | Inclusion |
| **Reduced motion** | Respect `prefers-reduced-motion` | A11y |
| **Color-blind modes** | Shape/icons, not color alone for ATS bands | Inclusion |
| **i18n** | RTL, locale-aware dates/numbers/currency | Global |

---

## 6. AI-Native & Explainability

| Area | Improvement | Impact |
|------|-------------|--------|
| **Natural-language explanations** | "Why this score?" in plain language | Trust |
| **Evidence links** | Click dimension → highlight resume/JD snippets | Transparency |
| **Resume diff** | Side-by-side original vs tailored with highlights | Trust |
| **Conversational search** | "Find senior PM roles in fintech" | Efficiency |
| **Smart defaults** | Pre-fill from resume/profile | Efficiency |
| **Predictive actions** | "You usually apply within 48h — apply now?" | Engagement |
| **Interview prep** | Per-application AI prep tips | Value-add |
| **Skill-gap narrative** | "To reach 80+, add evidence for X and Y" | Guidance |
| **Bias/fairness dashboards** | Admin view of scoring across demographics (privacy-safe) | Compliance |

---

## 7. Data Visualization & Dashboards

| Area | Improvement | Impact |
|------|-------------|--------|
| **ATS dimension charts** | Radial/bar for parse, must, nice, etc. | Clarity |
| **Pipeline funnel** | Application funnel over time | Insights |
| **Calibration curves** | Score vs P(interview) for admins | Insights |
| **Skill heatmap** | Candidate skills vs role requirements | Clarity |
| **Time-series** | Applications/week, response rates | Insights |
| **Cohort views** | Performance by source, role, time | Analytics |
| **Custom report builder** | Drag-and-drop metrics, filters, export | Power users |

---

## 8. Real-Time & Collaboration

| Area | Improvement | Impact |
|------|-------------|--------|
| **Live updates** | Application status, ATS scores, matches without refresh | Responsiveness |
| **Presence** | "Recruiter viewing this candidate" | Collaboration |
| **Comments/notes** | Threaded on applications, candidates, jobs | Collaboration |
| **Activity feed** | "Jane applied to PM at Acme" | Awareness |
| **Collaborative review** | Multiple recruiters rating/annotating | Workflow |
| **Push/in-app notifications** | Status changes, new matches, reminders | Engagement |

---

## 9. Performance & Perceived Speed

| Area | Improvement | Impact |
|------|-------------|--------|
| **Skeleton loaders** | Lists, cards, modals | Perceived speed |
| **Optimistic updates** | Apply/save before server confirm | Responsiveness |
| **Infinite scroll / virtual lists** | Long lists without heavy pagination | Scale |
| **Prefetch / background sync** | Preload likely next views | Speed |
| **Offline-first** | Cache key data, sync when online | Reliability |

---

## 10. Mobile & Cross-Device

| Area | Improvement | Impact |
|------|-------------|--------|
| **Responsive design** | Cards, tables, forms adapt to screen | Mobile |
| **Touch targets** | ≥44px tap areas | Mobile |
| **PWA** | Installable, offline, push | Mobile |
| **Native apps** | React Native / Flutter if needed | Mobile |
| **Share targets** | "Share job to CandidateMatch" | Integration |
| **Quick actions** | Widgets/shortcuts: apply, ATS check | Efficiency |

---

## 11. Trust, Compliance & Transparency

| Area | Improvement | Impact |
|------|-------------|--------|
| **Adverse-action notice** | NYC AEDT–style structured notice with reasons | Compliance |
| **Decision audit trail** | Who did what when, link to evidence | Compliance |
| **HITL queue** | "Needs review" for borderline scores | Fairness |
| **Consent management** | Data usage, retention, deletion UI | Compliance |
| **Bias reports** | Aggregate analytics (anonymized) for admins | Fairness |
| **Policy versioning** | View active vs historical scoring policies | Audit |

---

## 12. Integrations & Extensibility

| Area | Improvement | Impact |
|------|-------------|--------|
| **Embeddable widgets** | Apply button, job feed for career sites | Distribution |
| **White-label** | Logos, colors, domain for agencies | Enterprise |
| **Webhooks** | On apply, status change, new match | Integration |
| **API playground** | Try endpoints in browser | Developer |
| **Zapier/Make** | Automate workflows | Integration |
| **Chrome/sidebar extensions** | Apply from LinkedIn, Indeed | Efficiency |

---

## 13. Enterprise & Scale

| Area | Improvement | Impact |
|------|-------------|--------|
| **Multi-tenant** | Orgs, permissions, data isolation | Scale |
| **SSO / SAML / SCIM** | Enterprise identity, provisioning | Enterprise |
| **Audit log viewer** | Searchable admin audit | Compliance |
| **Feature flags** | Per-org or per-user toggles | Control |
| **Usage analytics** | Dashboards, limits, quotas | Billing |
| **Custom fields** | Org-specific metadata | Flexibility |

---

## 14. Future-Forward (10–25 Years)

| Area | Improvement | Impact |
|------|-------------|--------|
| **Voice UI** | "Apply to my top match", "What's my ATS score?" | Accessibility |
| **AR/XR** | Interview prep or onboarding in AR/VR | Immersion |
| **Ambient UI** | Notifications, nudges in ambient displays | Engagement |
| **Agentic UI** | AI agent books interviews, sends follow-ups | Automation |
| **Neuro-adaptive** | Optional adaptation to attention/cognitive load | Accessibility |
| **Embedded AI coaches** | In-context coaching during apply, tailor, prep | Value-add |
| **Decentralized identity** | Verifiable credentials, portable profiles | Privacy |
| **Spatial computing** | Candidate/recruiter rooms in 3D spaces | Future |

---

## 15. Design System & Maintainability

| Area | Improvement | Impact |
|------|-------------|--------|
| **Component library** | Reusable, documented, tested | Consistency |
| **Design tokens** | Colors, spacing, typography as config | Theming |
| **Storybook** | Visual catalog and docs | Design-dev |
| **A11y testing** | Automated checks in CI | Quality |
| **Visual regression** | Protect layouts | Quality |
| **Design-dev handoff** | Figma → code workflow | Efficiency |

---

## 16. Implementation Priority (Suggested)

1. **Done:** Apply/tailor gating (<60, 61–79, ≥80); consistent badge colors; Saved tab rules.
2. **Done:** Paste JD → ATS check; ATS breakdown collapsible; tailor progress; empty-state copy.
3. **Done:** ATS tooltip (hover band explanation); match "why" expand; calibration badge in collapsed panel; job age badge; tailor CTA ("Run ATS to see new score"); onboarding checklist; improved empty states with CTAs; Skeleton/CardSkeleton components; Modal Escape + focus trap; card hover transition.
4. **Later:** Animations; dimension chart (already have bar in AtsBreakdownPanel); command palette; bulk actions; real-time.
5. **Roadmap:** Accessibility; adverse-action notice; multi-tenant; voice/AR.

---

## 17. Technical Notes

- **Score source:** Use `ats_score ?? fit_score` when `ats_score` is null.
- **Feature flags:** `candidate_see_ats_fix_report`, `candidate_tailor_resume`, `ats_check_allowed`, `recruiter_run_ats_check`.
- **Recruiter override:** Recruiters can confirm applied despite low score; audit should reflect.
- **Paste JD ATS:** New `POST /api/ats/check-paste` — `jd_text`, `candidate_id`, `resume_id?`; ephemeral or optionally save as ad-hoc job.
