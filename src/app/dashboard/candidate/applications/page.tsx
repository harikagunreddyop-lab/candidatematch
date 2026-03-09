'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ChevronLeft,
  Briefcase,
  Loader2,
  ChevronDown,
  ChevronUp,
  LayoutGrid,
  List,
  Calendar,
  MessageSquare,
  Award,
  XCircle,
  Clock,
} from 'lucide-react';
import { formatDate, formatRelative } from '@/utils/helpers';
import { KanbanBoard, ApplicationDetailModal } from '@/components/applications';
import type { Application } from '@/types/applications';
import { getApplicationJob, daysInStatus } from '@/types/applications';

const STATUS_CONFIG: Record<string, { label: string; nextStep: string; icon: React.ReactNode; color: string }> = {
  ready: { label: 'Ready', nextStep: 'Submit your application to be considered.', icon: <Clock className="w-4 h-4" />, color: 'bg-surface-500/10 text-surface-400' },
  applied: { label: 'Applied', nextStep: 'Your application is under review. The hiring team may reach out for next steps.', icon: <Briefcase className="w-4 h-4" />, color: 'bg-blue-500/10 text-blue-400' },
  screening: { label: 'Screening', nextStep: 'Your profile is being screened. Prepare for a possible phone or video call.', icon: <MessageSquare className="w-4 h-4" />, color: 'bg-amber-500/10 text-amber-400' },
  interview: { label: 'Interview', nextStep: 'Interview stage. Check your email for scheduling and prepare for the interview.', icon: <Calendar className="w-4 h-4" />, color: 'bg-brand-400/10 text-brand-400' },
  offer: { label: 'Offer', nextStep: 'You have an offer! Review the details and respond by the deadline.', icon: <Award className="w-4 h-4" />, color: 'bg-emerald-500/10 text-emerald-400' },
  rejected: { label: 'Rejected', nextStep: 'This application was not advanced. Keep applying — other opportunities may be a better fit.', icon: <XCircle className="w-4 h-4" />, color: 'bg-red-500/10 text-red-400' },
  withdrawn: { label: 'Withdrawn', nextStep: 'You withdrew from this application.', icon: <XCircle className="w-4 h-4" />, color: 'bg-surface-500/10 text-surface-500' },
};

function normalizeApplication(raw: any): Application {
  const job = raw.job;
  return {
    id: raw.id,
    candidate_id: raw.candidate_id,
    job_id: raw.job_id,
    status: raw.status,
    applied_at: raw.applied_at ?? null,
    notes: raw.notes ?? null,
    interview_date: raw.interview_date ?? null,
    offer_details: raw.offer_details ?? null,
    next_action_required: raw.next_action_required ?? null,
    next_action_due: raw.next_action_due ?? null,
    withdrawal_reason: raw.withdrawal_reason ?? null,
    candidate_notes: raw.candidate_notes ?? null,
    interview_notes: raw.interview_notes ?? null,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    job: Array.isArray(job) ? job[0] ?? null : job ?? null,
    days_in_status: raw.days_in_status ?? daysInStatus(raw.updated_at),
  };
}

export default function CandidateApplicationsPage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'kanban' | 'timeline'>('kanban');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [detailApplication, setDetailApplication] = useState<Application | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [timelineByApp, setTimelineByApp] = useState<Record<string, any[]>>({});
  const [loadingTimeline, setLoadingTimeline] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<{
    total_applications: number;
    response_rate: number;
    interview_rate: number;
    offer_rate: number;
  } | null>(null);

  const loadApplications = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/applications?limit=200', { credentials: 'include' });
    const data = await res.json().catch(() => ({}));
    const list = (data.applications ?? []).map(normalizeApplication);
    setApplications(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadApplications();
  }, [loadApplications]);

  useEffect(() => {
    fetch('/api/candidate/applications/analytics', { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => setAnalytics(data))
      .catch(() => {});
  }, []);

  const handleStatusChange = useCallback(async (applicationId: string, newStatus: Application['status']) => {
    const res = await fetch(`/api/applications/${applicationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ status: newStatus }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Update failed');
    }
    const updated = await res.json();
    setApplications((prev) =>
      prev.map((a) =>
        a.id === applicationId ? { ...normalizeApplication(updated), job: a.job } : a
      )
    );
    if (detailApplication?.id === applicationId) {
      setDetailApplication((prev) => (prev ? { ...normalizeApplication(updated), job: prev.job } : null));
    }
  }, [detailApplication?.id]);

  async function loadTimeline(applicationId: string) {
    if (timelineByApp[applicationId]?.length) return;
    setLoadingTimeline(applicationId);
    try {
      const res = await fetch(`/api/applications/timeline?application_id=${applicationId}`);
      const data = await res.json();
      if (res.ok && Array.isArray(data.timeline)) {
        setTimelineByApp((prev) => ({ ...prev, [applicationId]: data.timeline }));
      }
    } finally {
      setLoadingTimeline(null);
    }
  }

  const filtered =
    statusFilter === 'all'
      ? applications
      : applications.filter((a) => a.status === statusFilter);

  return (
    <div className="min-h-screen bg-surface-900 text-surface-100">
      <div className="max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link
          href="/dashboard/candidate"
          className="text-surface-400 hover:text-surface-200 flex items-center gap-1 text-sm mb-6"
        >
          <ChevronLeft size={18} /> Dashboard
        </Link>

        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold font-display tracking-tight">Applications</h1>
            <p className="text-surface-400 mt-1 text-sm">
              {filtered.length} application{filtered.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm text-surface-400">Status:</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="input py-2 px-3 bg-surface-800 border-surface-700 text-surface-100 text-sm"
            >
              <option value="all">All</option>
              <option value="ready">Ready</option>
              <option value="applied">Applied</option>
              <option value="screening">Screening</option>
              <option value="interview">Interview</option>
              <option value="offer">Offer</option>
              <option value="rejected">Rejected</option>
              <option value="withdrawn">Withdrawn</option>
            </select>
            <div className="flex rounded-lg border border-surface-700 overflow-hidden">
              <button
                type="button"
                onClick={() => setViewMode('kanban')}
                className={`p-2 ${viewMode === 'kanban' ? 'bg-brand-500/20 text-brand-400' : 'bg-surface-800 text-surface-400 hover:text-surface-200'}`}
                title="Kanban board"
              >
                <LayoutGrid size={18} />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('timeline')}
                className={`p-2 ${viewMode === 'timeline' ? 'bg-brand-500/20 text-brand-400' : 'bg-surface-800 text-surface-400 hover:text-surface-200'}`}
                title="Timeline list"
              >
                <List size={18} />
              </button>
            </div>
          </div>
        </div>

        {analytics && analytics.total_applications > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <div className="rounded-xl border border-surface-700/60 bg-surface-800/50 p-4">
              <p className="text-xs text-surface-500 uppercase tracking-wide">Response rate</p>
              <p className="text-2xl font-bold text-surface-100 mt-0.5">{analytics.response_rate}%</p>
              <p className="text-xs text-surface-400 mt-1">Moved past applied</p>
            </div>
            <div className="rounded-xl border border-surface-700/60 bg-surface-800/50 p-4">
              <p className="text-xs text-surface-500 uppercase tracking-wide">Interview rate</p>
              <p className="text-2xl font-bold text-surface-100 mt-0.5">{analytics.interview_rate}%</p>
              <p className="text-xs text-surface-400 mt-1">Reached screening/interview/offer</p>
            </div>
            <div className="rounded-xl border border-surface-700/60 bg-surface-800/50 p-4">
              <p className="text-xs text-surface-500 uppercase tracking-wide">Offer rate</p>
              <p className="text-2xl font-bold text-surface-100 mt-0.5">{analytics.offer_rate}%</p>
              <p className="text-xs text-surface-400 mt-1">Received offer</p>
            </div>
            <div className="rounded-xl border border-surface-700/60 bg-surface-800/50 p-4">
              <p className="text-xs text-surface-500 uppercase tracking-wide">Total</p>
              <p className="text-2xl font-bold text-surface-100 mt-0.5">{analytics.total_applications}</p>
              <p className="text-xs text-surface-400 mt-1">Applications</p>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-brand-400" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-surface-700/60 bg-surface-800/50 p-12 text-center">
            <Briefcase className="w-12 h-12 text-surface-500 mx-auto mb-4" />
            <p className="text-surface-400">
              {statusFilter === 'all'
                ? "You haven't applied to any jobs yet."
                : `No applications with status "${STATUS_CONFIG[statusFilter]?.label ?? statusFilter}".`}
            </p>
            <Link
              href="/dashboard/candidate/jobs"
              className="inline-block mt-4 text-brand-400 hover:text-brand-300 font-medium"
            >
              Browse jobs →
            </Link>
          </div>
        ) : viewMode === 'kanban' ? (
          <KanbanBoard
            applications={filtered}
            onStatusChange={handleStatusChange}
            onCardClick={(app) => setDetailApplication(app)}
          />
        ) : (
          <div className="space-y-4">
            {filtered.map((app) => {
              const job = getApplicationJob(app);
              const config = STATUS_CONFIG[app.status] ?? STATUS_CONFIG.ready;
              const isExpanded = expandedId === app.id;
              return (
                <div
                  key={app.id}
                  className="bg-surface-800/50 border border-surface-700/60 rounded-xl overflow-hidden"
                >
                  <div
                    className="p-6 cursor-pointer"
                    onClick={() => {
                      setExpandedId(isExpanded ? null : app.id);
                      if (!isExpanded) loadTimeline(app.id);
                    }}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <button
                          type="button"
                          className="text-left text-lg font-semibold text-surface-100 hover:text-brand-400 transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDetailApplication(app);
                          }}
                        >
                          {job?.title || 'Job'}
                        </button>
                        <div className="text-surface-400 text-sm mt-0.5">{job?.company}</div>
                        <div className="flex items-center gap-3 mt-2 text-xs text-surface-500">
                          <span>Applied {app.applied_at ? formatRelative(app.applied_at) : '—'}</span>
                          {app.interview_date && (
                            <span className="flex items-center gap-1 text-brand-400">
                              <Calendar className="w-3 h-3" />
                              Interview {formatDate(app.interview_date)}
                            </span>
                          )}
                          {(app.days_in_status ?? daysInStatus(app.updated_at)) > 0 && (
                            <span>{app.days_in_status ?? daysInStatus(app.updated_at)}d in stage</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1.5 ${config.color}`}
                        >
                          {config.icon}
                          {config.label}
                        </span>
                        {isExpanded ? (
                          <ChevronUp className="w-5 h-5 text-surface-400" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-surface-400" />
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-surface-400 mt-3">What’s next? {config.nextStep}</p>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-surface-700/60 px-6 py-4 bg-surface-900/50">
                      <h4 className="text-sm font-bold text-surface-200 mb-2">Status timeline</h4>
                      {loadingTimeline === app.id ? (
                        <div className="flex items-center gap-2 text-surface-500 text-sm">
                          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
                        </div>
                      ) : (timelineByApp[app.id]?.length ?? 0) > 0 ? (
                        <ul className="space-y-2">
                          {(timelineByApp[app.id] || []).map((entry: any) => (
                            <li key={entry.id} className="flex items-center gap-3 text-sm">
                              <span className="text-surface-500 shrink-0">
                                {formatDate(entry.created_at)}
                              </span>
                              <span className="text-surface-300">
                                {entry.from_status ? `${entry.from_status} → ` : ''}
                                {entry.to_status}
                                {entry.notes && ` — ${entry.notes}`}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-surface-500">No timeline entries yet.</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ApplicationDetailModal
        application={detailApplication}
        open={!!detailApplication}
        onClose={() => setDetailApplication(null)}
      />
    </div>
  );
}
