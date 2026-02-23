import { createClient } from '@/lib/supabase-browser';

export type AuditAction =
  | 'assignment.create'
  | 'assignment.remove'
  | 'application.status_change'
  | 'application.interview_schedule'
  | 'candidate.approve'
  | 'candidate.reject'
  | 'matching.run'
  | 'scraping.run'
  | 'settings.update';

export async function logAudit(params: {
  action: AuditAction;
  resourceType: string;
  resourceId?: string;
  details?: Record<string, unknown>;
}) {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const profile = session?.user?.id
    ? await supabase.from('profiles').select('role').eq('id', session.user.id).single().then(r => r.data)
    : null;
  await supabase.from('audit_log').insert({
    actor_id: session?.user?.id ?? null,
    actor_role: profile?.role ?? 'unknown',
    action: params.action,
    resource_type: params.resourceType,
    resource_id: params.resourceId ?? null,
    details: params.details ?? {},
  });
}

/** Server-side audit for API routes. Pass the service/server Supabase client and actor info from requireApiAuth. */
export async function logAuditServer(
  supabase: { from: (table: string) => { insert: (row: object) => Promise<{ error: unknown }> } },
  actor: { actor_id: string; actor_role: string },
  params: {
    action: AuditAction;
    resourceType: string;
    resourceId?: string;
    details?: Record<string, unknown>;
  }
) {
  await supabase.from('audit_log').insert({
    actor_id: actor.actor_id,
    actor_role: actor.actor_role,
    action: params.action,
    resource_type: params.resourceType,
    resource_id: params.resourceId ?? null,
    details: params.details ?? {},
  });
}
