'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-browser';
import { Calendar, List, Plus, ChevronLeft, ChevronRight, Briefcase, SlidersHorizontal } from 'lucide-react';
import { EmptyState, Modal } from '@/components/ui';
import {
  InterviewCalendar,
  InterviewCard,
} from '@/components/interviews';
import type { Interview } from '@/types/interviews';
import { cn } from '@/utils/helpers';

function getJob(inv: Interview) {
  const j = inv.job;
  if (!j) return null;
  return Array.isArray(j) ? j[0] ?? null : j;
}

type ApplicationRow = { id: string; job_id: string; job: { id: string; title: string; company: string } | { id: string; title: string; company: string }[] | null };

export default function CandidateInterviewsPage() {
  const supabase = createClient();
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [applications, setApplications] = useState<Array<{ id: string; job_id: string; job: { id: string; title: string; company: string } | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
  const [listTab, setListTab] = useState<'upcoming' | 'past'>('upcoming');
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [selectedInterview, setSelectedInterview] = useState<Interview | null>(null);
  const [notLinked, setNotLinked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const load = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setLoading(false);
      return;
    }
    const { data: cand } = await supabase
      .from('candidates')
      .select('id')
      .eq('user_id', session.user.id)
      .single();
    if (!cand) {
      // #region agent log
      fetch('http://127.0.0.1:7830/ingest/7e7b9384-2f83-41f7-a326-f10ef9606c50',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bacffe'},body:JSON.stringify({sessionId:'bacffe',runId:'candidate-audit-1',hypothesisId:'H4',location:'interviews/page.tsx:52',message:'Candidate interviews page has no linked candidate',data:{hasSession:true},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      setNotLinked(true);
      setLoading(false);
      return;
    }

    const [intRes, appRes] = await Promise.all([
      fetch('/api/candidate/interviews', { credentials: 'include' }),
      supabase
        .from('applications')
        .select('id, job_id, job:jobs(id, title, company)')
        .eq('candidate_id', cand.id)
        .in('status', ['interview', 'screening', 'offer', 'applied']),
    ]);
    const intData = await intRes.json().catch(() => ({}));
    setInterviews(intData.interviews ?? []);
    const rawApps = (appRes.data ?? []) as ApplicationRow[];
    setApplications(rawApps.map((row) => ({
      id: row.id,
      job_id: row.job_id,
      job: Array.isArray(row.job) ? row.job[0] ?? null : row.job ?? null,
    })));
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const now = new Date().toISOString();
  const upcoming = interviews.filter((i) => i.scheduled_at >= now);
  const past = interviews.filter((i) => i.scheduled_at < now);

  const performance = {
    total: interviews.length,
    byType: interviews.reduce<Record<string, number>>((acc, i) => {
      const t = i.interview_type || 'other';
      acc[t] = (acc[t] || 0) + 1;
      return acc;
    }, {}),
    avgSelfAssessment:
      past.filter((i) => i.self_assessment_score != null).length > 0
        ? Math.round(
            past
              .filter((i) => i.self_assessment_score != null)
              .reduce((s, i) => s + (i.self_assessment_score ?? 0), 0) /
              past.filter((i) => i.self_assessment_score != null).length
          )
        : 0,
    successRate:
      past.length > 0
        ? Math.round(
            (past.filter((i) => i.outcome === 'passed').length / past.length) * 100
          )
        : 0,
  };

  const handleAddInterview = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    const job_id = fd.get('job_id') as string;
    const application_id = (fd.get('application_id') as string) || undefined;
    const scheduled_at = fd.get('scheduled_at') as string;
    const interview_type = (fd.get('interview_type') as string) || undefined;
    const duration_minutes = parseInt(String(fd.get('duration_minutes')), 10) || 60;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const virtual_meeting_link = (fd.get('virtual_meeting_link') as string) || undefined;
    const location = (fd.get('location') as string) || undefined;
    const interviewer_name = (fd.get('interviewer_name') as string) || undefined;
    const interviewer_title = (fd.get('interviewer_title') as string) || undefined;
    const interviewer_email = (fd.get('interviewer_email') as string) || undefined;

    if (!job_id || !scheduled_at) {
      setFormError('Job and date/time are required.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/candidate/interviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          job_id,
          application_id: application_id || null,
          scheduled_at: new Date(scheduled_at).toISOString(),
          interview_type: interview_type || null,
          duration_minutes,
          timezone,
          virtual_meeting_link: virtual_meeting_link || null,
          location: location || null,
          interviewer_name: interviewer_name || null,
          interviewer_title: interviewer_title || null,
          interviewer_email: interviewer_email || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create');
      setInterviews((prev) => [...prev, data]);
      setAddModalOpen(false);
      form.reset();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSaving(false);
    }
  };

  const handleAddToCalendar = (interview: Interview) => {
    const job = getJob(interview);
    const title = `Interview - ${job?.title ?? 'Interview'} at ${job?.company ?? ''}`;
    const start = new Date(interview.scheduled_at);
    const end = new Date(start.getTime() + (interview.duration_minutes || 60) * 60 * 1000);
    const format = (d: Date) => d.toISOString().replace(/-|:|\.\d+/g, '');
    const url = new URL('https://calendar.google.com/calendar/render');
    url.searchParams.set('action', 'TEMPLATE');
    url.searchParams.set('text', title);
    url.searchParams.set('dates', `${format(start)}/${format(end)}`);
    if (interview.virtual_meeting_link) url.searchParams.set('details', interview.virtual_meeting_link);
    window.open(url.toString(), '_blank');
  };

  const changeMonth = (delta: number) => {
    setCalendarMonth((m) => {
      const next = new Date(m);
      next.setMonth(next.getMonth() + delta);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }
  if (notLinked) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-6 text-center px-4">
        <p className="text-sm text-surface-500 dark:text-surface-300">
          Your account isn&apos;t linked to a candidate profile yet. Contact your recruiter.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-surface-900 font-display">
            Interviews
          </h1>
          <p className="text-surface-600 mt-0.5">
            Schedule, prepare, and track your interviews.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 p-1 rounded-xl bg-surface-100 border border-surface-300 w-fit">
            <button
              type="button"
              onClick={() => setViewMode('calendar')}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                viewMode === 'calendar'
                  ? 'bg-surface-200 text-surface-900 shadow-sm'
                  : 'text-surface-600 hover:text-surface-900'
              )}
              aria-pressed={viewMode === 'calendar'}
            >
              <Calendar size={16} />
              Calendar
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                viewMode === 'list'
                  ? 'bg-surface-200 text-surface-900 shadow-sm'
                  : 'text-surface-600 hover:text-surface-900'
              )}
              aria-pressed={viewMode === 'list'}
            >
              <List size={16} />
              List
            </button>
          </div>
          <button
            type="button"
            onClick={() => setAddModalOpen(true)}
            className="btn-primary flex items-center gap-2 py-2 px-4"
          >
            <Plus size={16} />
            Add interview
          </button>
        </div>
      </div>

      {viewMode === 'calendar' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-xl border border-surface-300 bg-surface-100 px-3 py-2">
            <button
              type="button"
              onClick={() => changeMonth(-1)}
              className="btn-ghost p-2 rounded-lg"
              aria-label="Previous month"
            >
              <ChevronLeft size={20} />
            </button>
            <h2 className="text-base font-semibold text-surface-900">
              {calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </h2>
            <button
              type="button"
              onClick={() => changeMonth(1)}
              className="btn-ghost p-2 rounded-lg"
              aria-label="Next month"
            >
              <ChevronRight size={20} />
            </button>
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <InterviewCalendar
              interviews={interviews}
              month={calendarMonth}
              onSelectInterview={setSelectedInterview}
              className="xl:col-span-2"
            />
            <div className="rounded-2xl border border-surface-300 bg-surface-100 p-4">
              <h3 className="text-sm font-semibold text-surface-900 mb-3">Upcoming this month</h3>
              {upcoming.filter((i) => {
                const d = new Date(i.scheduled_at);
                return d.getMonth() === calendarMonth.getMonth() && d.getFullYear() === calendarMonth.getFullYear();
              }).slice(0, 5).length === 0 ? (
                <p className="text-xs text-surface-600">No upcoming interviews in this month.</p>
              ) : (
                <div className="space-y-2">
                  {upcoming
                    .filter((i) => {
                      const d = new Date(i.scheduled_at);
                      return d.getMonth() === calendarMonth.getMonth() && d.getFullYear() === calendarMonth.getFullYear();
                    })
                    .slice(0, 5)
                    .map((inv) => {
                      const job = getJob(inv);
                      const dt = new Date(inv.scheduled_at);
                      return (
                        <button
                          key={inv.id}
                          type="button"
                          onClick={() => setSelectedInterview(inv)}
                          className="w-full text-left rounded-xl border border-surface-300 bg-surface-50 p-2.5 hover:border-brand-300 hover:bg-brand-50 transition-colors"
                        >
                          <p className="text-xs font-semibold text-surface-800 truncate">{job?.title ?? 'Interview'}</p>
                          <p className="text-[11px] text-surface-600 truncate">{job?.company ?? '—'}</p>
                          <p className="text-[11px] text-surface-500 mt-1">
                            {dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · {dt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                          </p>
                        </button>
                      );
                    })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {viewMode === 'list' && (
        <>
          <div className="flex gap-1 p-1 rounded-xl bg-surface-100 border border-surface-300 w-fit">
            <button
              type="button"
              onClick={() => setListTab('upcoming')}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium',
                listTab === 'upcoming' ? 'bg-surface-200 text-surface-900' : 'text-surface-600'
              )}
            >
              Upcoming ({upcoming.length})
            </button>
            <button
              type="button"
              onClick={() => setListTab('past')}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium',
                listTab === 'past' ? 'bg-surface-200 text-surface-900' : 'text-surface-600'
              )}
            >
              Past ({past.length})
            </button>
          </div>
          {listTab === 'upcoming' && (
            upcoming.length === 0 ? (
              <EmptyState
                icon={<Calendar size={24} />}
                title="No upcoming interviews"
                description="Add an interview from an application or use Add interview to schedule one."
                action={
                  <button type="button" onClick={() => setAddModalOpen(true)} className="btn-primary text-sm py-2 px-4">
                    Add interview
                  </button>
                }
              />
            ) : (
              <div className="space-y-4">
                {upcoming.map((inv) => (
                  <InterviewCard
                    key={inv.id}
                    interview={inv}
                    showCountdown
                    onAddToCalendar={handleAddToCalendar}
                  />
                ))}
              </div>
            )
          )}
          {listTab === 'past' && (
            past.length === 0 ? (
              <EmptyState
                icon={<Briefcase size={24} />}
                title="No past interviews"
                description="Completed interviews will appear here for notes and thank-you follow-up."
              />
            ) : (
              <div className="space-y-4">
                {past.map((inv) => (
                  <InterviewCard
                    key={inv.id}
                    interview={inv}
                    showCountdown={false}
                    onMarkThankYou={() => {
                      // #region agent log
                      fetch('http://127.0.0.1:7830/ingest/7e7b9384-2f83-41f7-a326-f10ef9606c50',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bacffe'},body:JSON.stringify({sessionId:'bacffe',runId:'candidate-audit-1',hypothesisId:'H3',location:'interviews/page.tsx:349',message:'Thank-you action uses hard navigation',data:{interviewId:inv.id,navigationMethod:'window.location.href'},timestamp:Date.now()})}).catch(()=>{});
                      // #endregion
                      window.location.href = `/dashboard/candidate/interview-prep?interviewId=${inv.id}&tab=thankyou`;
                    }}
                  />
                ))}
              </div>
            )
          )}
        </>
      )}

      {interviews.length > 0 && (
        <div className="rounded-xl border border-surface-300 bg-surface-100 p-5">
          <h3 className="text-lg font-semibold text-surface-900 mb-4">
            Performance at a glance
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-surface-600">Total interviews</p>
              <p className="text-2xl font-bold text-surface-900">{performance.total}</p>
            </div>
            <div>
              <p className="text-xs text-surface-600">Avg self-assessment</p>
              <p className="text-2xl font-bold text-surface-900">{performance.avgSelfAssessment}/10</p>
            </div>
            <div>
              <p className="text-xs text-surface-600">Pass rate</p>
              <p className="text-2xl font-bold text-surface-900">{performance.successRate}%</p>
            </div>
            <div>
              <p className="text-xs text-surface-600">By type</p>
              <p className="text-sm text-surface-700">
                {Object.entries(performance.byType)
                  .map(([t, n]) => `${t}: ${n}`)
                  .join(', ') || '—'}
              </p>
            </div>
          </div>
        </div>
      )}

      <Modal open={!!selectedInterview} onClose={() => setSelectedInterview(null)} title="Interview" size="lg">
        {selectedInterview && (
          <div className="mt-2">
            <InterviewCard
              interview={selectedInterview}
              showCountdown
              onAddToCalendar={handleAddToCalendar}
            />
            <Link
              href={`/dashboard/candidate/interview-prep?interviewId=${selectedInterview.id}`}
              className="btn-primary mt-4 inline-block"
            >
              Open interview prep
            </Link>
          </div>
        )}
      </Modal>

      <Modal open={addModalOpen} onClose={() => setAddModalOpen(false)} title="Add interview" size="md">
        <form onSubmit={handleAddInterview} className="space-y-4">
          {formError && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-700 text-sm">
              {formError}
            </div>
          )}
          <p className="text-xs text-surface-600 -mt-1">Quick schedule first. Add optional details only if needed.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="label text-surface-700">Job *</label>
              <select
                name="job_id"
                required
                className="input w-full h-10"
              >
                <option value="">Select a job</option>
                {applications.map((app) => {
                  const job = Array.isArray(app.job) ? app.job[0] : app.job;
                  if (!job) return null;
                  return (
                    <option key={app.id} value={job.id}>
                      {job.title} — {job.company}
                    </option>
                  );
                })}
              </select>
            </div>
            <div>
              <label className="label text-surface-700">Date & time *</label>
              <input
                type="datetime-local"
                name="scheduled_at"
                required
                className="input w-full h-10"
              />
            </div>
            <div>
              <label className="label text-surface-700">Duration</label>
              <input
                type="number"
                name="duration_minutes"
                defaultValue={60}
                min={15}
                step={15}
                className="input w-full h-10"
              />
            </div>
            <div>
              <label className="label text-surface-700">Type</label>
              <select name="interview_type" className="input w-full h-10">
                <option value="">Select</option>
                <option value="phone">Phone</option>
                <option value="video">Video</option>
                <option value="onsite">On-site</option>
                <option value="technical">Technical</option>
                <option value="behavioral">Behavioral</option>
                <option value="case_study">Case study</option>
              </select>
            </div>
            <div>
              <label className="label text-surface-700">Meeting link</label>
              <input
                type="url"
                name="virtual_meeting_link"
                placeholder="https://..."
                className="input w-full h-10"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="btn-ghost text-xs inline-flex items-center gap-1"
          >
            <SlidersHorizontal size={14} />
            {showAdvanced ? 'Hide advanced fields' : 'Show advanced fields'}
          </button>

          {showAdvanced && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border border-surface-300 bg-surface-100 p-3">
              <div className="sm:col-span-2">
                <label className="label text-surface-700">Link to application</label>
                <select name="application_id" className="input w-full h-10">
                  <option value="">None</option>
                  {applications.map((app) => (
                    <option key={app.id} value={app.id}>
                      {(() => {
                        const job = Array.isArray(app.job) ? app.job[0] : app.job;
                        return job ? `${job.title} — ${job.company}` : app.id;
                      })()}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="label text-surface-700">Location</label>
                <input
                  type="text"
                  name="location"
                  placeholder="Address or building"
                  className="input w-full h-10"
                />
              </div>
              <div>
                <label className="label text-surface-700">Interviewer name</label>
                <input type="text" name="interviewer_name" className="input w-full h-10" />
              </div>
              <div>
                <label className="label text-surface-700">Interviewer title</label>
                <input type="text" name="interviewer_title" className="input w-full h-10" />
              </div>
              <div className="sm:col-span-2">
                <label className="label text-surface-700">Interviewer email</label>
                <input type="email" name="interviewer_email" className="input w-full h-10" />
              </div>
            </div>
          )}

          {applications.length === 0 && (
            <p className="text-xs text-surface-600">
              <Link href="/dashboard/candidate/applications" className="underline">Add an application</Link> first to link an interview to a job.
            </p>
          )}

          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={() => setAddModalOpen(false)} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Saving…' : 'Add interview'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
