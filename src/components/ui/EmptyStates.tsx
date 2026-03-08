'use client';

import Link from 'next/link';
import {
  Briefcase,
  Sparkles,
  ClipboardList,
  Users,
  Activity,
  Building2,
  MessageCircle,
  FileText,
  Target,
  Bookmark,
} from 'lucide-react';
import { Button } from './Button';
import { cn } from '@/utils/helpers';

const emptyIconClass =
  'w-16 h-16 bg-brand-500/10 rounded-full flex items-center justify-center mb-4 ring-2 ring-brand-500/20';
const titleClass = 'text-xl font-semibold text-white mb-2 font-display';
const descClass = 'text-surface-400 text-center max-w-md mb-6';

export function EmptyJobsState({
  postJobHref = '/dashboard/recruiter/jobs/new',
}: { postJobHref?: string } = {}) {
  return (
    <div
      className="flex flex-col items-center justify-center py-16 px-4"
      role="status"
      aria-label="No jobs posted yet"
    >
      <div className={cn(emptyIconClass)} aria-hidden>
        <Briefcase className="w-8 h-8 text-brand-400" />
      </div>
      <h3 className={titleClass}>No jobs posted yet</h3>
      <p className={descClass}>
        Post your first job to start receiving AI-matched candidates.
      </p>
      <Link href={postJobHref} className="block">
        <Button
          variant="primary"
          size="lg"
          className="transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          Post Your First Job
        </Button>
      </Link>
    </div>
  );
}

export function EmptyMatchesState({ action }: { action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4" role="status">
      <div className={cn(emptyIconClass)} aria-hidden>
        <Sparkles className="w-8 h-8 text-brand-400" />
      </div>
      <h3 className={titleClass}>No matches yet</h3>
      <p className={descClass}>
        Your pipeline is getting ready. When jobs are added and matching runs, your best matches will appear here.
      </p>
      {action}
    </div>
  );
}

export function EmptyApplicationsState({ action }: { action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4" role="status">
      <div className={cn(emptyIconClass)} aria-hidden>
        <ClipboardList className="w-8 h-8 text-brand-400" />
      </div>
      <h3 className={titleClass}>No applications yet</h3>
      <p className={descClass}>
        Applications you submit will show up here with status and next steps.
      </p>
      {action}
    </div>
  );
}

export function EmptyTeamState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4" role="status">
      <div className={cn(emptyIconClass)} aria-hidden>
        <Users className="w-8 h-8 text-brand-400" />
      </div>
      <h3 className={titleClass}>No team members yet</h3>
      <p className={descClass}>
        Invite recruiters and hiring managers to collaborate on candidates and jobs.
      </p>
      <Link href="/dashboard/company/team" className="block">
        <Button variant="primary" size="lg" className="transition-all hover:scale-[1.02] active:scale-[0.98]">
          Go to Team
        </Button>
      </Link>
    </div>
  );
}

export function EmptyActivityState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4" role="status">
      <div className={cn(emptyIconClass)} aria-hidden>
        <Activity className="w-8 h-8 text-brand-400" />
      </div>
      <h3 className={titleClass}>No activity yet</h3>
      <p className={descClass}>
        Activity from applications, messages, and pipeline changes will appear here.
      </p>
    </div>
  );
}

export function EmptyCompaniesState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4" role="status">
      <div className={cn(emptyIconClass)} aria-hidden>
        <Building2 className="w-8 h-8 text-brand-400" />
      </div>
      <h3 className={titleClass}>No companies yet</h3>
      <p className={descClass}>
        Companies that sign up will appear here. You can manage billing and settings per company.
      </p>
    </div>
  );
}

export function EmptyMessagesState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4" role="status">
      <div className={cn(emptyIconClass)} aria-hidden>
        <MessageCircle className="w-8 h-8 text-brand-400" />
      </div>
      <h3 className={titleClass}>No conversations yet</h3>
      <p className={descClass}>
        Start a conversation with a candidate or colleague from their profile or the pipeline.
      </p>
    </div>
  );
}

export function EmptyResumesState({ action }: { action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4" role="status">
      <div className={cn(emptyIconClass)} aria-hidden>
        <FileText className="w-8 h-8 text-brand-400" />
      </div>
      <h3 className={titleClass}>No resumes uploaded</h3>
      <p className={descClass}>
        Upload a resume to get started with matches and tailored applications.
      </p>
      {action}
    </div>
  );
}

export function EmptySavedJobsState({ action }: { action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4" role="status">
      <div className={cn(emptyIconClass)} aria-hidden>
        <Bookmark className="w-8 h-8 text-brand-400" />
      </div>
      <h3 className={titleClass}>No saved jobs</h3>
      <p className={descClass}>
        Save jobs from matches or job search to apply later.
      </p>
      {action}
    </div>
  );
}

export function EmptyCandidatesState({ action }: { action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4" role="status">
      <div className={cn(emptyIconClass)} aria-hidden>
        <Users className="w-8 h-8 text-brand-400" />
      </div>
      <h3 className={titleClass}>No matches</h3>
      <p className={descClass}>
        Try a different search or filter, or run matching to see candidates.
      </p>
      {action}
    </div>
  );
}

export function EmptySkillReportState({ action }: { action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4" role="status">
      <div className={cn(emptyIconClass)} aria-hidden>
        <Target className="w-8 h-8 text-brand-400" />
      </div>
      <h3 className={titleClass}>No matches yet</h3>
      <p className={descClass}>
        Run matching to see why you score high or low for each role. Your recruiter will add jobs and run the engine.
      </p>
      {action}
    </div>
  );
}
