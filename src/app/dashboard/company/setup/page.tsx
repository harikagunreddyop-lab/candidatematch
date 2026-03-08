'use client';

import { useRouter } from 'next/navigation';
import { Building2, Users, Briefcase } from 'lucide-react';

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
      className="rounded-2xl border border-surface-700 bg-surface-800/80 p-6 text-left hover:border-violet-500/50 hover:bg-surface-800 transition-all group"
    >
      <div className="w-12 h-12 rounded-xl bg-violet-500/20 flex items-center justify-center text-violet-400 mb-4 group-hover:bg-violet-500/30">
        {icon}
      </div>
      <h3 className="text-lg font-bold text-white mb-2">{title}</h3>
      <p className="text-sm text-surface-400">{description}</p>
    </button>
  );
}

export default function CompanySetupWelcome() {
  const router = useRouter();

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-3xl w-full">
        <h1 className="text-4xl font-bold text-white text-center mb-4">
          Welcome to your company dashboard
        </h1>
        <p className="text-xl text-surface-400 text-center mb-12">
          Set up your team and jobs to get started
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <ActionCard
            icon={<Building2 className="w-6 h-6" />}
            title="Company Settings"
            description="Configure your company profile and billing"
            onClick={() => router.push('/dashboard/company/settings')}
          />
          <ActionCard
            icon={<Users className="w-6 h-6" />}
            title="Invite Your Team"
            description="Add recruiters and collaborators"
            onClick={() => router.push('/dashboard/company/team/invite')}
          />
          <ActionCard
            icon={<Briefcase className="w-6 h-6" />}
            title="View Jobs"
            description="Manage job postings and candidates"
            onClick={() => router.push('/dashboard/company/jobs')}
          />
        </div>

        <div className="text-center">
          <button
            type="button"
            onClick={() => router.push('/dashboard/company')}
            className="btn-secondary"
          >
            Skip to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
