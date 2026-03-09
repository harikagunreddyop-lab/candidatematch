'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase-browser';
import Link from 'next/link';
import {
  UserPlus,
  ChevronLeft,
  Users,
  Trophy,
  Target,
  CheckSquare,
  Settings,
} from 'lucide-react';
import {
  TeamLeaderboard,
  GoalTracker,
  TaskList,
  PermissionManager,
  RecruiterPerformanceCard,
} from '@/components/company/team';
import { cn } from '@/utils/helpers';

interface Member {
  id: string;
  name: string | null;
  email: string | null;
  effective_role: string;
}

export default function CompanyTeamPage() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'members' | 'leaderboard' | 'goals' | 'tasks'>('members');
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const supabase = createClient();

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setLoading(false);
        return;
      }

      const { data: profile } = await supabase
        .from('profile_roles')
        .select('company_id')
        .eq('id', session.user.id)
        .single();

      if (!profile?.company_id) {
        setLoading(false);
        return;
      }

      const [companyRes, teamRes] = await Promise.all([
        supabase.from('companies').select('id, name').eq('id', profile.company_id).single(),
        supabase
          .from('profile_roles')
          .select('id, name, email, effective_role')
          .eq('company_id', profile.company_id)
          .in('effective_role', ['company_admin', 'recruiter']),
      ]);

      setCompanyId(profile.company_id);
      setCompanyName((companyRes.data as { name: string } | null)?.name ?? null);
      setMembers((teamRes.data || []) as Member[]);
      setLoading(false);
    })();
  }, [supabase]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 flex items-center justify-center min-h-[200px]">
        <div className="animate-spin w-8 h-8 border-2 border-brand-400 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!companyId) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-2xl font-bold text-surface-900 dark:text-white mb-2">Team</h1>
        <p className="text-surface-500">No company linked. Contact your administrator.</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <Link
            href="/dashboard/company"
            className="text-surface-400 hover:text-white flex items-center gap-1 text-sm mb-2"
          >
            <ChevronLeft size={18} /> Dashboard
          </Link>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-white">Team</h1>
          {companyName && (
            <p className="text-surface-500 text-sm mt-0.5">{companyName}</p>
          )}
        </div>
        <Link
          href="/dashboard/company/team/invite"
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-semibold transition-colors w-fit"
        >
          <UserPlus className="w-4 h-4" />
          Invite Member
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { key: 'members', label: 'Members', icon: Users },
          { key: 'leaderboard', label: 'Leaderboard', icon: Trophy },
          { key: 'goals', label: 'Goals', icon: Target },
          { key: 'tasks', label: 'Tasks', icon: CheckSquare },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => { setView(key as typeof view); setSelectedMember(null); }}
            className={cn(
              'inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors',
              view === key
                ? 'bg-brand-500 text-white'
                : 'bg-surface-100 dark:bg-surface-800 text-surface-700 dark:text-surface-300 hover:bg-surface-200 dark:hover:bg-surface-700'
            )}
          >
            <Icon size={18} /> {label}
          </button>
        ))}
      </div>

      {view === 'members' && (
        <div className="rounded-2xl border border-surface-200 dark:border-surface-700 bg-surface-100 overflow-hidden">
          {members.length === 0 ? (
            <div className="p-12 text-center">
              <Users className="w-12 h-12 text-surface-400 mx-auto mb-4" />
              <p className="text-surface-500 mb-4">No team members yet.</p>
              <Link
                href="/dashboard/company/team/invite"
                className="inline-flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-semibold transition-colors"
              >
                <UserPlus className="w-4 h-4" />
                Invite Member
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-surface-200 dark:divide-surface-700">
              {members.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between px-6 py-4 hover:bg-surface-100 dark:hover:bg-surface-700/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-brand-400/20 flex items-center justify-center text-brand-400 font-semibold text-sm">
                      {(m.name || m.email || '?')[0].toUpperCase()}
                    </div>
                    <div>
                      <div className="font-medium text-surface-900 dark:text-white">
                        {m.name || m.email || 'Unknown'}
                      </div>
                      <div className="text-sm text-surface-500">{m.email}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 rounded-full text-xs font-medium bg-brand-400/10 text-brand-400 capitalize">
                      {m.effective_role?.replace('_', ' ')}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedMember(selectedMember?.id === m.id ? null : m)}
                      className="p-2 rounded-lg border border-surface-200 dark:border-surface-600 text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-700"
                      title="Permissions & performance"
                    >
                      <Settings size={18} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {view === 'leaderboard' && <TeamLeaderboard period="monthly" />}
      {view === 'goals' && <GoalTracker />}
      {view === 'tasks' && <TaskList />}

      {selectedMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setSelectedMember(null)} role="dialog" aria-modal="true">
          <div
            className="bg-white dark:bg-surface-800 rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-surface-900 dark:text-surface-100 mb-4">
              {selectedMember.name || selectedMember.email} · Permissions & performance
            </h2>
            <div className="space-y-6">
              <PermissionManager
                userId={selectedMember.id}
                userName={selectedMember.name || selectedMember.email}
              />
              <RecruiterPerformanceCard
                recruiterId={selectedMember.id}
                recruiterName={selectedMember.name || selectedMember.email}
                period="monthly"
              />
            </div>
            <button
              type="button"
              onClick={() => setSelectedMember(null)}
              className="mt-6 w-full py-2 rounded-lg border border-surface-300 dark:border-surface-600 text-sm font-medium"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
