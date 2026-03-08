/**
 * Auto-follow-up reminders: schedule and list follow-ups for applications.
 * Integrates with candidate applications and optional cron/worker.
 */

import { createServiceClient } from '@/lib/supabase-server';

export interface FollowUpReminder {
  id: string;
  application_id: string;
  candidate_id: string;
  remind_at: string;
  note?: string;
  created_at: string;
}

const TABLE = 'follow_up_reminders';

/** Schedule a follow-up reminder for an application. */
export async function scheduleFollowUp(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  candidateId: string,
  applicationId: string,
  remindAt: Date,
  note?: string
): Promise<{ id?: string; error?: string }> {
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      candidate_id: candidateId,
      application_id: applicationId,
      remind_at: remindAt.toISOString(),
      note: note || null,
    })
    .select('id')
    .single();
  if (error) return { error: error.message };
  return { id: data?.id };
}

/** Get due reminders for a candidate (remind_at <= now). */
export async function getDueReminders(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  candidateId: string
): Promise<FollowUpReminder[]> {
  const { data } = await supabase
    .from(TABLE)
    .select('*')
    .eq('candidate_id', candidateId)
    .lte('remind_at', new Date().toISOString())
    .order('remind_at', { ascending: true });
  return (data || []) as FollowUpReminder[];
}

/** Get upcoming reminders for a candidate. */
export async function getUpcomingReminders(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  candidateId: string,
  limit = 10
): Promise<FollowUpReminder[]> {
  const { data } = await supabase
    .from(TABLE)
    .select('*')
    .eq('candidate_id', candidateId)
    .gte('remind_at', new Date().toISOString())
    .order('remind_at', { ascending: true })
    .limit(limit);
  return (data || []) as FollowUpReminder[];
}

/** Mark a reminder as done (delete or mark completed). */
export async function completeReminder(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  reminderId: string,
  candidateId: string
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('id', reminderId)
    .eq('candidate_id', candidateId);
  return error ? { error: error.message } : {};
}
