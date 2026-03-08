'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, UserPlus, Loader2 } from 'lucide-react';

export default function CompanyTeamInvitePage() {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'recruiter' | 'company_admin'>('recruiter');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInviteLink(null);
    if (!email.trim()) {
      setError('Email is required');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/companies/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), role }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to send invite');
        return;
      }
      const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
      setInviteLink(`${baseUrl}/accept-invite?token=${data.token}`);
      setEmail('');
    } catch {
      setError('Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto px-4 sm:px-6 py-8 space-y-6">
      <Link
        href="/dashboard/company/team"
        className="text-surface-400 hover:text-white flex items-center gap-1 text-sm"
      >
        <ChevronLeft size={18} /> Team
      </Link>
      <h1 className="text-2xl font-bold text-surface-900 dark:text-white">Invite Member</h1>
      <p className="text-surface-500 text-sm">
        Invite a team member to join your company as a recruiter or company admin. They will receive a link to accept the invite.
      </p>

      <form onSubmit={handleSubmit} className="rounded-2xl border border-surface-200 dark:border-surface-700 bg-surface-100 p-6 space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="colleague@company.com"
            className="w-full px-4 py-2 rounded-xl border border-surface-300 dark:border-surface-600 bg-surface-100 text-surface-900 dark:text-white placeholder-surface-400 focus:ring-2 focus:ring-brand-400 focus:border-transparent"
            disabled={loading}
          />
        </div>
        <div>
          <label htmlFor="role" className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
            Role
          </label>
          <select
            id="role"
            value={role}
            onChange={(e) => setRole(e.target.value as 'recruiter' | 'company_admin')}
            className="w-full px-4 py-2 rounded-xl border border-surface-300 dark:border-surface-600 bg-surface-100 text-surface-900 dark:text-white focus:ring-2 focus:ring-brand-400 focus:border-transparent"
            disabled={loading}
          >
            <option value="recruiter">Recruiter</option>
            <option value="company_admin">Company Admin</option>
          </select>
          <p className="text-xs text-surface-500 mt-1">
            Company admins can manage team and billing; recruiters can manage jobs and candidates.
          </p>
        </div>
        {error && (
          <p className="text-sm text-red-500">{error}</p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-brand-400 hover:bg-brand-300 text-[#0a0f00] disabled:opacity-60 text-white rounded-xl font-semibold transition-colors"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
          {loading ? 'Sending…' : 'Send invite'}
        </button>
      </form>

      {inviteLink && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 dark:bg-emerald-500/10 p-6">
          <p className="font-semibold text-surface-900 dark:text-white mb-2">Invite created</p>
          <p className="text-sm text-surface-600 dark:text-surface-400 mb-2">
            Share this link with the invitee (email delivery can be configured separately):
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              readOnly
              value={inviteLink}
              className="flex-1 px-3 py-2 rounded-lg border border-surface-300 dark:border-surface-600 bg-surface-100 dark:bg-surface-800 text-surface-900 dark:text-white text-sm"
            />
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(inviteLink)}
              className="px-4 py-2 bg-surface-200 dark:bg-surface-700 hover:bg-surface-300 dark:hover:bg-surface-600 text-surface-900 dark:text-white rounded-lg text-sm font-medium transition-colors"
            >
              Copy
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
