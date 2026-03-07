/**
 * Activity log helpers — write audit events to public.activity_log (Phase 1).
 * Use with createServiceClient(); RLS allows company members to INSERT for own company.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type ActivityAction =
  | 'job_created'
  | 'candidate_viewed'
  | 'job_updated'
  | 'job_deactivated';

export interface LogActivityParams {
  supabase: SupabaseClient;
  company_id: string;
  user_id: string | null;
  action: ActivityAction;
  resource_type: string;
  resource_id: string | null;
  metadata?: Record<string, unknown>;
  ip_address?: string | null;
  user_agent?: string | null;
}

export async function logActivity(params: LogActivityParams): Promise<void> {
  const {
    supabase,
    company_id,
    user_id,
    action,
    resource_type,
    resource_id,
    metadata = {},
    ip_address,
    user_agent,
  } = params;

  await supabase.from('activity_log').insert({
    company_id,
    user_id: user_id || null,
    action,
    resource_type,
    resource_id: resource_id || null,
    metadata,
    ip_address: ip_address || null,
    user_agent: user_agent || null,
  });
}

/** Parse IP from NextRequest (e.g. x-forwarded-for or x-real-ip). */
export function getClientIp(req: Request): string | null {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() ?? null;
  return req.headers.get('x-real-ip') ?? null;
}
