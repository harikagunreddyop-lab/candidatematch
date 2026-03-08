'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase-browser';
import Link from 'next/link';
import {
  ChevronLeft,
  Briefcase,
  Clock,
  CheckCircle2,
  XCircle,
  MessageSquare,
  Calendar,
  Award,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { formatDate, formatRelative } from '@/utils/helpers';

const STATUS_CONFIG: Record<string, { label: string; nextStep: string; icon: React.ReactNode; color: string }> = {
  ready: { label: 'Ready', nextStep: 'Submit your application to be considered.', icon: <Clock className="w-4 h-4" />, color: 'bg-surface-500/10 text-surface-400' },
  applied: { label: 'Applied', nextStep: 'Your application is under review. The hiring team may reach out for next steps.', icon: <Briefcase className="w-4 h-4" />, color: 'bg-blue-500/10 text-blue-400' },
  screening: { label: 'Screening', nextStep: 'Your profile is being screened. Prepare for a possible phone or video call.', icon: <MessageSquare className="w-4 h-4" />, color: 'bg-amber-500/10 text-amber-400' },
  interview: { label: 'Interview', nextStep: 'Interview stage. Check your email for scheduling and prepare for the interview.', icon: <Calendar className="w-4 h-4" />, color: 'bg-violet-500/10 text-violet-400' },
  offer: { label: 'Offer', nextStep: 'You have an offer! Review the details and respond by the deadline.', icon: <Award className="w-4 h-4" />, color: 'bg-emerald-500/10 text-emerald-400' },
  rejected: { label: 'Rejected', nextStep: 'This application was not advanced. Keep applying — other opportunities may be a better fit.', icon: <XCircle className="w-4 h-4" />, color: 'bg-red-500/10 text-red-400' },
  withdrawn: { label: 'Withdrawn', nextStep: 'You withdrew from this application.', icon: <XCircle className="w-4 h-4" />, color: 'bg-surface-500/10 text-surface-500' },
};

export default function CandidateApplicationsPage() {
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [timelineByApp, setTimelineByApp] = useState<Record<string, any[]>>({});
  const [loadingTimeline, setLoadingTimeline] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    loadApplications();
  }, []);

  async function loadApplications() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setLoading(false);
      return;
    }

    const { data: candidate } = await supabase
      .from('candidates')
      .select('id')
      .eq('user_id', session.user.id)
      .single();

    if (!candidate) {
      setApplications([]);
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from('applications')
      .select(`
        id, status, applied_at, updated_at, interview_date,
        job:jobs(id, title, company)
      `)
      .eq('candidate_id', candidate.id)
      .order('updated_at', { ascending: false });

    setApplications(data || []);
    setLoading(false);
  }

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

  const filtered = statusFilter === 'all'
    ? applications
    : applications.filter((a: any) => a.status === statusFilter);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link href="/dashboard/candidate" className="text-surface-400 hover:text-white flex items-center gap-1 text-sm mb-6">
        <ChevronLeft size={18} /> Dashboard
      </Link>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-white">Applications</h1>
          <p className="text-surface-400 mt-1">{filtered.length} application{filtered.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-sm text-surface-400">Status:</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-surface-800 border border-surface-700 rounded-lg text-white"
          >
            <option value="all">All</option>
            <option value="applied">Applied</option>
            <option value="screening">Screening</option>
            <option value="interview">Interview</option>
            <option value="offer">Offer</option>
            <option value="rejected">Rejected</option>
            <option value="withdrawn">Withdrawn</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-surface-700/60 bg-surface-800/50 p-12 text-center">
          <Briefcase className="w-12 h-12 text-surface-500 mx-auto mb-4" />
          <p className="text-surface-400">
            {statusFilter === 'all' ? 'You haven’t applied to any jobs yet.' : `No applications with status "${STATUS_CONFIG[statusFilter]?.label || statusFilter}".`}
          </p>
          <Link href="/dashboard/candidate/matches" className="inline-block mt-4 text-violet-400 hover:text-violet-300 font-medium">Browse matches →</Link>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((app: any) => {
            const job = Array.isArray(app.job) ? app.job[0] : app.job;
            const config = STATUS_CONFIG[app.status] || STATUS_CONFIG.ready;
            const isExpanded = expandedId === app.id;
            return (
              <div key={app.id} className="bg-surface-800/50 border border-surface-700/60 rounded-xl overflow-hidden">
                <div
                  className="p-6 cursor-pointer"
                  onClick={() => {
                    setExpandedId(isExpanded ? null : app.id);
                    if (!isExpanded) loadTimeline(app.id);
                  }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <Link
                        href={job ? `/dashboard/candidate/jobs/${job.id}` : '#'}
                        className="text-lg font-semibold text-white hover:text-violet-400 transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {job?.title || 'Job'}
                      </Link>
                      <div className="text-surface-400 text-sm mt-0.5">{job?.company}</div>
                      <div className="flex items-center gap-3 mt-2 text-xs text-surface-500">
                        <span>Applied {app.applied_at ? formatRelative(app.applied_at) : '—'}</span>
                        {app.interview_date && (
                          <span className="flex items-center gap-1 text-violet-400">
                            <Calendar className="w-3 h-3" />
                            Interview {formatDate(app.interview_date)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1.5 ${config.color}`}>
                        {config.icon}
                        {config.label}
                      </span>
                      {isExpanded ? <ChevronUp className="w-5 h-5 text-surface-400" /> : <ChevronDown className="w-5 h-5 text-surface-400" />}
                    </div>
                  </div>
                  <p className="text-sm text-surface-400 mt-3">What’s next? {config.nextStep}</p>
                </div>

                {isExpanded && (
                  <div className="border-t border-surface-700/60 px-6 py-4 bg-surface-900/50">
                    <h4 className="text-sm font-semibold text-white mb-2">Status timeline</h4>
                    {loadingTimeline === app.id ? (
                      <div className="flex items-center gap-2 text-surface-500 text-sm">
                        <Loader2 className="w-4 h-4 animate-spin" /> Loading…
                      </div>
                    ) : (timelineByApp[app.id]?.length ?? 0) > 0 ? (
                      <ul className="space-y-2">
                        {(timelineByApp[app.id] || []).map((entry: any) => (
                          <li key={entry.id} className="flex items-center gap-3 text-sm">
                            <span className="text-surface-500 shrink-0">{formatDate(entry.created_at)}</span>
                            <span className="text-surface-300">
                              {entry.from_status ? `${entry.from_status} → ` : ''}{entry.to_status}
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
  );
}
