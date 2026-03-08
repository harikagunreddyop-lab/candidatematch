'use client';

import { useRouter } from 'next/navigation';
import { Briefcase, Users, Zap } from 'lucide-react';

function ActionCard({
  icon,
  title,
  description,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl border border-surface-700 bg-surface-100 p-6 text-left hover:border-brand-400/50 hover:bg-surface-200 transition-all group"
    >
      <div className="w-12 h-12 rounded-xl bg-brand-400/20 flex items-center justify-center text-brand-400 mb-4 group-hover:bg-brand-400/30">
        {icon}
      </div>
      <h3 className="text-lg font-bold text-white mb-2">{title}</h3>
      <p className="text-sm text-surface-400">{description}</p>
    </button>
  );
}

export default function RecruiterWelcome() {
  const router = useRouter();

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-3xl w-full">
        <h1 className="text-4xl font-bold text-white text-center mb-4">
          Welcome to your hiring command center
        </h1>
        <p className="text-xl text-surface-400 text-center mb-12">
          Here&apos;s how to get started
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <ActionCard
            icon={<Briefcase className="w-6 h-6" />}
            title="Post a Job"
            description="Create your first job posting and our AI will find matches"
            onClick={() => router.push('/dashboard/recruiter/jobs/new')}
          />
          <ActionCard
            icon={<Users className="w-6 h-6" />}
            title="Review Matches"
            description="AI-matched candidates are waiting for you"
            onClick={() => router.push('/dashboard/recruiter/candidates')}
          />
          <ActionCard
            icon={<Zap className="w-6 h-6" />}
            title="Invite Your Team"
            description="Collaborate with your team members"
            onClick={() => router.push('/dashboard/company/team/invite')}
          />
        </div>

        <div className="text-center">
          <button
            type="button"
            onClick={() => router.push('/dashboard/recruiter')}
            className="btn-secondary"
          >
            Skip to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
