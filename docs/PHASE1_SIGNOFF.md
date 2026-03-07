# Phase 1: Multi-Tenant RBAC Database — Sign-Off

**Status:** Complete (Option B — additive)  
**Migration:** `041_phase1_enterprise_additions.sql`  
**Date:** Applied with 038 → 039 → 040 → 041 order.

---

## Summary

Phase 1 adds enterprise-oriented columns and the `activity_log` table, and tightens jobs RLS to be company-scoped. The existing **profiles** + **profile_roles** and **candidate_job_matches** schema is unchanged. No **users** table; no rename of **candidate_job_matches** to **matches**.

---

## Tables

| Table | Purpose |
|-------|--------|
| **companies** | Tenants; subscription and limits (039). Phase 1 adds: trial_ends_at, settings, created_by. |
| **profiles** | Extends auth.users; role, company_id, effective_role (039). |
| **profile_roles** | VIEW over profiles; single source of truth for effective_role. |
| **jobs** | Jobs; company_id, posted_by, visibility (039). Phase 1 adds: created_by (optional). |
| **candidate_job_matches** | Matches (not renamed to matches). |
| **candidates** | Candidate profiles. |
| **company_invitations** | Invitations to company (039). |
| **activity_log** | **New.** Enterprise activity log (action, resource_type, resource_id, metadata, ip_address, user_agent). |
| **candidate_activity** | Existing; candidate-centric events (unchanged). |
| **company_analytics**, **recruiter_performance**, **platform_metrics** | 039. |
| **success_fee_events**, **success_fee_agreements**, **company_usage** | 040. |

---

## View

- **profile_roles** — id, name, email, legacy_role, company_id, permissions, last_active_at, avatar_url, subscription_tier, subscription_status, is_active, created_at, updated_at, **effective_role**.

---

## Helper functions (public)

- **get_effective_role()** — Current user’s effective role (platform_admin | company_admin | recruiter | candidate).
- **get_user_company()** — Current user’s company_id.
- **is_platform_admin()** — True if current user is platform admin.
- **is_company_admin_or_above()** — True if platform_admin or company_admin.
- **can_access_company(target_company_id)** — True if platform admin or user’s company = target (Phase 1 addition).
- **update_updated_at_column()** — Trigger helper for updated_at.

---

## RLS (relevant to Phase 1)

- **companies** — platform_admin all; company members read own; company_admin update own (039).
- **jobs** — jobs_select_all (SELECT all) remains; Phase 1 adds: platform_admin all; company members SELECT/INSERT for own company; company_admin UPDATE/DELETE any company job; recruiter UPDATE/DELETE only own (posted_by = auth.uid()).
- **activity_log** — platform_admin all; company members SELECT/INSERT for own company (Phase 1).

---

## Migration order

1. 038_subscription_tier.sql  
2. 039_multitenant_rbac.sql  
3. 040_success_fee_events.sql  
4. **041_phase1_enterprise_additions.sql**

---

## Deferred (optional later)

- **users** table — Not created. Role/company resolution remains via **profile_roles** and **profiles**.
- **matches** — Not created; **candidate_job_matches** is the table name.
- **auth.user_role()** / **auth.user_company_id()** — Not created; use **get_effective_role()** and **get_user_company()** in public.

---

## Verification

Run the queries in [docs/PHASE1_VERIFICATION_QUERIES.sql](PHASE1_VERIFICATION_QUERIES.sql) in the Supabase SQL Editor after applying 041. Confirm:

- All listed tables and the profile_roles view exist.
- Helper functions exist.
- Companies have trial_ends_at, settings, created_by.
- Jobs have company_id, posted_by, visibility, created_by.
- activity_log exists with expected columns.
- RLS is enabled on companies, jobs, company_invitations, activity_log.
- Jobs and activity_log policies match the intent above.

---

**Phase 1 complete.** Proceed to Phase 2 (auth helpers and type safety) when ready.
