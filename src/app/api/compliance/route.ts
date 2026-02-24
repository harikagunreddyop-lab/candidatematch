import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireApiAuth } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const authResult = await requireApiAuth(req);
  if (authResult instanceof Response) return authResult;

  const supabase = createServiceClient();
  const type = req.nextUrl.searchParams.get('type');

  if (type === 'consent') {
    const profileId = req.nextUrl.searchParams.get('profile_id') || authResult.profile.id;
    if (profileId !== authResult.profile.id && authResult.profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { data, error } = await supabase
      .from('consent_records')
      .select('*')
      .eq('profile_id', profileId)
      .order('created_at', { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ consents: data || [] });
  }

  if (type === 'deletion-requests') {
    if (authResult.profile.role === 'admin') {
      const { data, error } = await supabase
        .from('data_deletion_requests')
        .select('*, profile:profiles!profile_id(name, email, role)')
        .order('requested_at', { ascending: false });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ requests: data || [] });
    }
    const { data, error } = await supabase
      .from('data_deletion_requests')
      .select('*')
      .eq('profile_id', authResult.profile.id)
      .order('requested_at', { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ requests: data || [] });
  }

  if (type === 'retention-policies') {
    const { data, error } = await supabase
      .from('data_retention_policies')
      .select('*')
      .order('data_category');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ policies: data || [] });
  }

  if (type === 'stats' && authResult.profile.role === 'admin') {
    const [consents, deletions, policies, profilesWithConsent] = await Promise.all([
      supabase.from('consent_records').select('consent_type, granted', { count: 'exact' }),
      supabase.from('data_deletion_requests').select('status'),
      supabase.from('data_retention_policies').select('*'),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).not('privacy_policy_accepted_at', 'is', null),
    ]);

    const deletionsByStatus: Record<string, number> = {};
    for (const d of (deletions.data || [])) {
      deletionsByStatus[d.status] = (deletionsByStatus[d.status] || 0) + 1;
    }

    return NextResponse.json({
      total_consent_records: consents.count || 0,
      profiles_with_consent: profilesWithConsent.count || 0,
      deletion_requests: deletionsByStatus,
      retention_policies: policies.data || [],
    });
  }

  return NextResponse.json({ error: 'type parameter required (consent, deletion-requests, retention-policies, stats)' }, { status: 400 });
}

export async function POST(req: NextRequest) {
  const authResult = await requireApiAuth(req);
  if (authResult instanceof Response) return authResult;

  const supabase = createServiceClient();
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { action } = body;

  if (action === 'record_consent') {
    const { consent_type, granted } = body;
    if (!consent_type || typeof granted !== 'boolean') {
      return NextResponse.json({ error: 'consent_type and granted (boolean) required' }, { status: 400 });
    }

    const { data, error } = await supabase.from('consent_records').insert({
      profile_id: authResult.profile.id,
      consent_type,
      granted,
      granted_at: granted ? new Date().toISOString() : null,
      revoked_at: !granted ? new Date().toISOString() : null,
      ip_address: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
      user_agent: req.headers.get('user-agent') || 'unknown',
    }).select().single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const updates: Record<string, any> = {};
    if (consent_type === 'privacy_policy' && granted) updates.privacy_policy_accepted_at = new Date().toISOString();
    if (consent_type === 'data_processing') updates.data_processing_consent = granted;
    if (consent_type === 'marketing_emails') updates.marketing_consent = granted;
    if (Object.keys(updates).length > 0) {
      await supabase.from('profiles').update(updates).eq('id', authResult.profile.id);
    }

    await supabase.from('audit_log').insert({
      actor_id: authResult.profile.id,
      actor_role: authResult.profile.role,
      action: 'consent.update',
      resource_type: 'consent',
      resource_id: data.id,
      details: { consent_type, granted },
    });

    return NextResponse.json({ consent: data });
  }

  if (action === 'request_deletion') {
    const { reason } = body;

    const { data: existing } = await supabase
      .from('data_deletion_requests')
      .select('id')
      .eq('profile_id', authResult.profile.id)
      .in('status', ['pending', 'approved', 'processing'])
      .single();

    if (existing) {
      return NextResponse.json({ error: 'You already have a pending deletion request' }, { status: 409 });
    }

    const { data, error } = await supabase.from('data_deletion_requests').insert({
      profile_id: authResult.profile.id,
      reason: reason || null,
    }).select().single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await supabase.from('profiles').update({ deletion_requested_at: new Date().toISOString() }).eq('id', authResult.profile.id);

    await supabase.from('audit_log').insert({
      actor_id: authResult.profile.id,
      actor_role: authResult.profile.role,
      action: 'deletion.request',
      resource_type: 'deletion_request',
      resource_id: data.id,
      details: { reason },
    });

    return NextResponse.json({ request: data });
  }

  if (action === 'review_deletion' && authResult.profile.role === 'admin') {
    const { request_id, status, review_notes } = body;
    if (!request_id || !['approved', 'rejected'].includes(status)) {
      return NextResponse.json({ error: 'request_id and status (approved/rejected) required' }, { status: 400 });
    }

    const { data, error } = await supabase.from('data_deletion_requests').update({
      status,
      reviewed_by: authResult.profile.id,
      reviewed_at: new Date().toISOString(),
      review_notes: review_notes || null,
    }).eq('id', request_id).select().single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await supabase.from('audit_log').insert({
      actor_id: authResult.profile.id,
      actor_role: 'admin',
      action: `deletion.${status}`,
      resource_type: 'deletion_request',
      resource_id: request_id,
      details: { status, review_notes },
    });

    return NextResponse.json({ request: data });
  }

  if (action === 'execute_deletion' && authResult.profile.role === 'admin') {
    const { request_id } = body;
    if (!request_id) return NextResponse.json({ error: 'request_id required' }, { status: 400 });

    const { data: deleteReq } = await supabase
      .from('data_deletion_requests')
      .select('profile_id, status')
      .eq('id', request_id)
      .single();

    if (!deleteReq || deleteReq.status !== 'approved') {
      return NextResponse.json({ error: 'Request must be approved before execution' }, { status: 400 });
    }

    const pid = deleteReq.profile_id;
    await supabase.from('data_deletion_requests').update({ status: 'processing' }).eq('id', request_id);

    const { data: cand } = await supabase.from('candidates').select('id').eq('user_id', pid).single();

    if (cand) {
      await supabase.from('application_reminders').delete().eq('candidate_id', cand.id);
      await supabase.from('candidate_saved_jobs').delete().eq('candidate_id', cand.id);
      await supabase.from('candidate_job_matches').delete().eq('candidate_id', cand.id);
      await supabase.from('applications').delete().eq('candidate_id', cand.id);
      await supabase.from('resume_versions').delete().eq('candidate_id', cand.id);
      await supabase.from('candidate_resumes').delete().eq('candidate_id', cand.id);
      await supabase.from('recruiter_candidate_assignments').delete().eq('candidate_id', cand.id);

      await supabase.from('candidates').update({
        full_name: '[Deleted User]',
        email: null,
        phone: null,
        location: null,
        linkedin_url: null,
        portfolio_url: null,
        github_url: null,
        summary: null,
        parsed_resume_text: null,
        default_pitch: null,
        active: false,
        skills: [],
        experience: [],
        education: [],
        certifications: [],
      }).eq('id', cand.id);
    }

    await supabase.from('messages').delete().eq('sender_id', pid);
    await supabase.from('conversation_participants').delete().eq('profile_id', pid);

    await supabase.from('profiles').update({
      name: '[Deleted User]',
      email: `deleted_${pid.slice(0, 8)}@anonymized.local`,
      avatar_url: null,
      phone: null,
      linkedin_url: null,
      bio: null,
      is_active: false,
    }).eq('id', pid);

    await supabase.from('data_deletion_requests').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
    }).eq('id', request_id);

    await supabase.from('audit_log').insert({
      actor_id: authResult.profile.id,
      actor_role: 'admin',
      action: 'deletion.executed',
      resource_type: 'deletion_request',
      resource_id: request_id,
      details: { profile_id: pid, candidate_id: cand?.id },
    });

    return NextResponse.json({ success: true, message: 'User data has been anonymized and deleted' });
  }

  if (action === 'update_retention' && authResult.profile.role === 'admin') {
    const { policy_id, retention_days, auto_delete } = body;
    if (!policy_id) return NextResponse.json({ error: 'policy_id required' }, { status: 400 });

    const updates: Record<string, any> = { updated_by: authResult.profile.id, updated_at: new Date().toISOString() };
    if (typeof retention_days === 'number') updates.retention_days = retention_days;
    if (typeof auto_delete === 'boolean') updates.auto_delete = auto_delete;

    const { data, error } = await supabase.from('data_retention_policies').update(updates).eq('id', policy_id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await supabase.from('audit_log').insert({
      actor_id: authResult.profile.id,
      actor_role: 'admin',
      action: 'settings.update',
      resource_type: 'retention_policy',
      resource_id: policy_id,
      details: { retention_days, auto_delete },
    });

    return NextResponse.json({ policy: data });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
