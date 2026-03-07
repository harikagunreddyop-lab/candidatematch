/**
 * Phase 2: Auth context type and role guards — single source of truth for effective role + company.
 * Use with profile_roles data (API auth, server auth, middleware).
 */
import type { EffectiveRole } from '@/types';

/** Minimal auth context from profile_roles: id, effective_role, company_id. */
export interface AuthContext {
  id: string;
  effective_role: EffectiveRole;
  company_id: string | null;
}

export function isPlatformAdmin(ctx: { effective_role: string }): boolean {
  return ctx.effective_role === 'platform_admin';
}

export function isCompanyAdminOrAbove(ctx: { effective_role: string }): boolean {
  return ctx.effective_role === 'platform_admin' || ctx.effective_role === 'company_admin';
}

export function isCompanyStaff(ctx: { effective_role: string }): boolean {
  return ['platform_admin', 'company_admin', 'recruiter'].includes(ctx.effective_role);
}

/** Returns company_id if user has one; platform_admin may have no company. */
export function getCompanyId(ctx: AuthContext): string | null {
  return ctx.company_id ?? null;
}

/** Asserts company context; use after role check for company-scoped routes. */
export function requireCompanyId(ctx: AuthContext): string {
  const id = getCompanyId(ctx);
  if (!id) throw new Error('No company context');
  return id;
}

/** EffectiveRole union for type-safe route allowlists. */
export const EFFECTIVE_ROLES: EffectiveRole[] = [
  'platform_admin',
  'company_admin',
  'recruiter',
  'candidate',
];

export function isValidEffectiveRole(s: string): s is EffectiveRole {
  return EFFECTIVE_ROLES.includes(s as EffectiveRole);
}
