'use client';
// src/app/dashboard/admin/users/page.tsx
import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { SearchInput, EmptyState, Spinner, Modal } from '@/components/ui';
import {
  UserCheck, Plus, RefreshCw, AlertCircle, Edit2, Trash2,
  X, Mail, Phone, Briefcase, Users, ChevronDown, ChevronUp,
  Send, CheckCircle2, Sliders, Shield, Eye, EyeOff, Info,
  Zap, FileText, Target, Bookmark, Bell, Download, BarChart2,
  MessageSquare, Brain, Cpu,
} from 'lucide-react';
import { cn, formatRelative } from '@/utils/helpers';

const ROLE_OPTIONS = ['admin', 'recruiter', 'candidate'];
const SPECIALIZATION_OPTIONS = [
  'Software Engineering', 'Data Science & ML', 'Product Management', 'Design & UX',
  'DevOps & Infrastructure', 'Finance & Accounting', 'Sales & Marketing',
  'Healthcare & Medical', 'Legal', 'Operations', 'HR & People', 'Executive',
];
const TIMEZONE_OPTIONS = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Toronto', 'Europe/London', 'Europe/Paris', 'Asia/Kolkata', 'Asia/Tokyo',
  'Australia/Sydney', 'Pacific/Auckland',
];

// ─── Feature Definitions ────────────────────────────────────────────────────
interface FeatureDef {
  key: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  defaultEnabled: boolean;
  roles: ('candidate' | 'recruiter')[];
  group: string;
}

const CANDIDATE_FEATURES: FeatureDef[] = [
  {
    key: 'candidate_see_matches',
    label: 'View job matches',
    description: 'Candidate can see and browse their matched jobs list.',
    icon: <Target size={15} />,
    defaultEnabled: true,
    roles: ['candidate'],
    group: 'Core',
  },
  {
    key: 'candidate_apply_jobs',
    label: 'Apply to jobs',
    description: 'Candidate can submit job applications from the dashboard.',
    icon: <CheckCircle2 size={15} />,
    defaultEnabled: true,
    roles: ['candidate'],
    group: 'Core',
  },
  {
    key: 'candidate_upload_resume',
    label: 'Upload resumes',
    description: 'Candidate can upload their own PDF resumes.',
    icon: <FileText size={15} />,
    defaultEnabled: true,
    roles: ['candidate'],
    group: 'Core',
  },
  {
    key: 'candidate_download_resume',
    label: 'Download resumes',
    description: 'Candidate can download their uploaded or generated resumes.',
    icon: <Download size={15} />,
    defaultEnabled: true,
    roles: ['candidate'],
    group: 'Core',
  },
  {
    key: 'candidate_save_jobs',
    label: 'Save / bookmark jobs',
    description: 'Candidate can bookmark jobs for later review.',
    icon: <Bookmark size={15} />,
    defaultEnabled: true,
    roles: ['candidate'],
    group: 'Core',
  },
  {
    key: 'candidate_see_ats_fix_report',
    label: 'ATS fix report',
    description: 'Candidate can see ATS optimization tips for their resume.',
    icon: <BarChart2 size={15} />,
    defaultEnabled: true,
    roles: ['candidate'],
    group: 'AI Features',
  },
  {
    key: 'candidate_see_why_score',
    label: 'Match score explanation',
    description: 'Candidate can view "why this score" breakdown for each match.',
    icon: <Brain size={15} />,
    defaultEnabled: true,
    roles: ['candidate'],
    group: 'AI Features',
  },
  {
    key: 'candidate_job_brief',
    label: 'AI job brief',
    description: 'Candidate can generate an AI brief for any matched job.',
    icon: <Zap size={15} />,
    defaultEnabled: true,
    roles: ['candidate'],
    group: 'AI Features',
  },
  {
    key: 'candidate_tailor_resume',
    label: 'Tailor resume to job',
    description: 'Candidate can request a tailored resume version for a specific job.',
    icon: <FileText size={15} />,
    defaultEnabled: true,
    roles: ['candidate'],
    group: 'AI Features',
  },
  {
    key: 'candidate_reminders',
    label: 'Application reminders',
    description: 'Candidate can set follow-up reminders on their applications.',
    icon: <Bell size={15} />,
    defaultEnabled: true,
    roles: ['candidate'],
    group: 'Productivity',
  },
  {
    key: 'candidate_messages',
    label: 'Messages',
    description: 'Candidate can view and send messages to their recruiter.',
    icon: <MessageSquare size={15} />,
    defaultEnabled: true,
    roles: ['candidate'],
    group: 'Productivity',
  },
  {
    key: 'candidate_export_data',
    label: 'Export personal data',
    description: 'Candidate can export their full profile and applications as JSON.',
    icon: <Download size={15} />,
    defaultEnabled: true,
    roles: ['candidate'],
    group: 'Productivity',
  },
];

const RECRUITER_FEATURES: FeatureDef[] = [
  {
    key: 'recruiter_view_candidates',
    label: 'View assigned candidates',
    description: 'Recruiter can view their assigned candidates list and profiles.',
    icon: <Users size={15} />,
    defaultEnabled: true,
    roles: ['recruiter'],
    group: 'Core',
  },
  {
    key: 'recruiter_view_matches',
    label: 'View candidate matches',
    description: 'Recruiter can see job matches for their candidates.',
    icon: <Target size={15} />,
    defaultEnabled: true,
    roles: ['recruiter'],
    group: 'Core',
  },
  {
    key: 'recruiter_manage_applications',
    label: 'Manage applications',
    description: 'Recruiter can update application statuses and add notes.',
    icon: <CheckCircle2 size={15} />,
    defaultEnabled: true,
    roles: ['recruiter'],
    group: 'Core',
  },
  {
    key: 'recruiter_view_pipeline',
    label: 'Pipeline board',
    description: 'Recruiter can view and use the Kanban pipeline board.',
    icon: <Cpu size={15} />,
    defaultEnabled: true,
    roles: ['recruiter'],
    group: 'Core',
  },
  {
    key: 'resume_generation_allowed',
    label: 'AI resume generation',
    description: 'Recruiter can trigger AI-powered resume generation for candidates (score < 75 only).',
    icon: <FileText size={15} />,
    defaultEnabled: false,
    roles: ['recruiter'],
    group: 'AI Features',
  },
  {
    key: 'recruiter_bulk_apply',
    label: 'Bulk apply',
    description: 'Recruiter can bulk-submit applications on behalf of candidates.',
    icon: <Zap size={15} />,
    defaultEnabled: true,
    roles: ['recruiter'],
    group: 'AI Features',
  },
  {
    key: 'recruiter_ai_assistant',
    label: 'AI assistant',
    description: 'Recruiter can use the AI assistant for candidate & job insights.',
    icon: <Brain size={15} />,
    defaultEnabled: true,
    roles: ['recruiter'],
    group: 'AI Features',
  },
  {
    key: 'recruiter_view_job_descriptions',
    label: 'View job descriptions',
    description: 'Recruiter can open full job description modals for matched jobs.',
    icon: <Briefcase size={15} />,
    defaultEnabled: true,
    roles: ['recruiter'],
    group: 'AI Features',
  },
  {
    key: 'recruiter_messages',
    label: 'Messages',
    description: 'Recruiter can send and receive messages on the platform.',
    icon: <MessageSquare size={15} />,
    defaultEnabled: true,
    roles: ['recruiter'],
    group: 'Productivity',
  },
  {
    key: 'recruiter_view_reports',
    label: 'Reports',
    description: 'Recruiter can view their performance and pipeline reports.',
    icon: <BarChart2 size={15} />,
    defaultEnabled: true,
    roles: ['recruiter'],
    group: 'Productivity',
  },
];

function Toggle({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!enabled)}
      className={cn(
        'relative w-11 h-6 rounded-full transition-colors shrink-0 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-brand-500',
        enabled ? 'bg-brand-500' : 'bg-surface-300 dark:bg-surface-600'
      )}
      aria-checked={enabled}
      role="switch"
    >
      <span
        className={cn(
          'absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-transform',
          enabled ? 'translate-x-5' : 'translate-x-0.5'
        )}
      />
    </button>
  );
}

function FeatureRow({ feature, enabled, onChange }: {
  feature: FeatureDef;
  enabled: boolean;
  onChange: (key: string, val: boolean) => void;
}) {
  return (
    <div className={cn(
      'flex items-start gap-4 px-4 py-3.5 rounded-xl border transition-all',
      enabled
        ? 'border-brand-200 dark:border-brand-500/40 bg-brand-50/60 dark:bg-brand-500/10'
        : 'border-surface-200 dark:border-surface-600 bg-white dark:bg-surface-700/30'
    )}>
      <div className={cn(
        'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5',
        enabled ? 'bg-brand-500/20 text-brand-600 dark:text-brand-400' : 'bg-surface-100 dark:bg-surface-700 text-surface-500 dark:text-surface-400'
      )}>
        {feature.icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm font-semibold', enabled ? 'text-surface-900 dark:text-surface-100' : 'text-surface-600 dark:text-surface-300')}>
          {feature.label}
        </p>
        <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5 leading-snug">{feature.description}</p>
      </div>
      <Toggle enabled={enabled} onChange={(val) => onChange(feature.key, val)} />
    </div>
  );
}

// ─── Feature Access Modal ─────────────────────────────────────────────────────
function FeatureAccessModal({ user, onClose }: { user: any; onClose: () => void }) {
  const supabase = createClient();
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const featureList = user.role === 'candidate' ? CANDIDATE_FEATURES : RECRUITER_FEATURES;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/feature-flags/user?user_id=${user.id}`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.ok) {
        const data = await res.json();
        // Merge defaults first, then overrides
        const merged: Record<string, boolean> = {};
        for (const f of featureList) merged[f.key] = f.defaultEnabled;
        for (const [k, v] of Object.entries(data.flags ?? {})) merged[k] = v as boolean;
        setFlags(merged);
      }
    } catch { }
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, supabase]);

  useEffect(() => { load(); }, [load]);

  const handleChange = (key: string, val: boolean) => {
    setFlags(prev => ({ ...prev, [key]: val }));
    setSaved(false);
  };

  const enableAll = () => {
    const next: Record<string, boolean> = {};
    for (const f of featureList) next[f.key] = true;
    setFlags(next);
    setSaved(false);
  };

  const disableAll = () => {
    const next: Record<string, boolean> = {};
    for (const f of featureList) next[f.key] = false;
    setFlags(next);
    setSaved(false);
  };

  const resetToDefaults = () => {
    const next: Record<string, boolean> = {};
    for (const f of featureList) next[f.key] = f.defaultEnabled;
    setFlags(next);
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/feature-flags/user', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ user_id: user.id, flags }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      setSaved(true);
    } catch (e: any) {
      setError(e.message);
    }
    setSaving(false);
  };

  // Group features by group
  const groups = Array.from(new Set(featureList.map(f => f.group)));
  const enabledCount = featureList.filter(f => flags[f.key] !== false && (flags[f.key] !== undefined ? flags[f.key] : f.defaultEnabled)).length;

  const roleColor = user.role === 'candidate'
    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
    : 'bg-brand-500/15 text-brand-700 dark:text-brand-300';

  return (
    <Modal open onClose={onClose} title="" size="xl">
      {/* Header */}
      <div className="-mt-5 -mx-6 px-6 pt-5 pb-5 mb-5 border-b border-surface-100 dark:border-surface-700 bg-gradient-to-r from-surface-50 to-white dark:from-surface-700/50 dark:to-surface-800 rounded-t-2xl">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-500/20 to-brand-600/20 dark:from-brand-500/30 dark:to-brand-600/30 flex items-center justify-center shrink-0">
            <Sliders size={22} className="text-brand-600 dark:text-brand-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-surface-900 dark:text-surface-100 font-display">Feature Access</h2>
              <span className={cn('px-2 py-0.5 rounded-md text-xs font-semibold', roleColor)}>
                {user.role}
              </span>
            </div>
            <p className="text-sm text-surface-500 dark:text-surface-400 mt-0.5">
              {user.name || user.email} · {enabledCount}/{featureList.length} features enabled
            </p>
          </div>
          {/* Bulk actions */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button onClick={enableAll} className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1">
              <Eye size={12} /> Enable all
            </button>
            <span className="text-surface-300 dark:text-surface-600">·</span>
            <button onClick={disableAll} className="text-xs font-medium text-surface-500 dark:text-surface-400 hover:underline flex items-center gap-1">
              <EyeOff size={12} /> Disable all
            </button>
            <span className="text-surface-300 dark:text-surface-600">·</span>
            <button onClick={resetToDefaults} className="text-xs font-medium text-surface-500 dark:text-surface-400 hover:underline flex items-center gap-1">
              <RefreshCw size={12} /> Defaults
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-4">
          <div className="flex justify-between text-xs text-surface-500 dark:text-surface-400 mb-1">
            <span>Features enabled</span>
            <span className="font-semibold tabular-nums">{enabledCount} / {featureList.length}</span>
          </div>
          <div className="h-1.5 rounded-full bg-surface-200 dark:bg-surface-600 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-400 transition-all duration-300"
              style={{ width: `${(enabledCount / featureList.length) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={28} /></div>
      ) : (
        <div className="space-y-6 max-h-[55vh] overflow-y-auto pr-1 -mr-2">
          {groups.map(group => (
            <div key={group}>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-1.5 h-1.5 rounded-full bg-brand-500" />
                <h3 className="text-xs font-bold text-surface-500 dark:text-surface-400 uppercase tracking-widest">{group}</h3>
              </div>
              <div className="space-y-2">
                {featureList.filter(f => f.group === group).map(feature => (
                  <FeatureRow
                    key={feature.key}
                    feature={feature}
                    enabled={flags[feature.key] !== undefined ? flags[feature.key] : feature.defaultEnabled}
                    onChange={handleChange}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* Info note */}
          <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 text-xs text-blue-700 dark:text-blue-300">
            <Info size={14} className="shrink-0 mt-0.5" />
            <span>
              These are <strong>per-user overrides</strong> and take highest priority.
              They override any role-level defaults. Changes take effect immediately after saving.
            </span>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-3 text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5">
          <AlertCircle size={13} />{error}
        </p>
      )}

      <div className="flex items-center justify-between mt-5 pt-4 border-t border-surface-200 dark:border-surface-700">
        {saved && (
          <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 font-medium">
            <CheckCircle2 size={14} /> Changes saved successfully
          </span>
        )}
        {!saved && <span />}
        <div className="flex gap-3">
          <button onClick={onClose} className="btn-secondary text-sm">Cancel</button>
          <button onClick={handleSave} disabled={saving || loading} className="btn-primary text-sm min-w-[120px] flex items-center justify-center gap-2">
            {saving ? <Spinner size={14} /> : <Shield size={14} />}
            {saving ? 'Saving...' : 'Save access'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function TagInput({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [input, setInput] = useState('');
  const uid = 'ti-' + (placeholder || '').replace(/\s/g, '');
  const add = () => { const t = input.trim(); if (t && !value.includes(t)) onChange([...value, t]); setInput(''); };
  return (
    <div className="flex flex-wrap gap-1.5 p-2 border border-surface-600 rounded-lg min-h-[40px] cursor-text bg-surface-800"
      onClick={() => document.getElementById(uid)?.focus()}>
      {value.map((tag, i) => (
        <span key={i} className="flex items-center gap-1 px-2 py-0.5 bg-brand-600/20 text-brand-300 rounded-md text-xs font-medium">
          {tag}<button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))}><X size={10} /></button>
        </span>
      ))}
      <input id={uid} value={input} onChange={e => setInput(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } }}
        onBlur={add} placeholder={value.length === 0 ? placeholder : ''}
        className="flex-1 min-w-[120px] outline-none text-xs bg-transparent placeholder-surface-400" />
    </div>
  );
}

export default function UsersPage() {
  const supabase = createClient();
  const [users, setUsers] = useState<any[]>([]);
  const [totalCandidates, setTotalCandidates] = useState(0);
  const [candidateAcceptedUserIds, setCandidateAcceptedUserIds] = useState<Set<string>>(new Set());
  const [assignmentCounts, setAssignmentCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [showInvite, setShowInvite] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [showEditForm, setShowEditForm] = useState(false);
  const [deleting, setDeleting] = useState<any | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [featureUser, setFeatureUser] = useState<any | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const [profilesRes, assignRes] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('recruiter_candidate_assignments').select('recruiter_id'),
    ]);

    if (profilesRes.error) setError(profilesRes.error.message);
    else setUsers(profilesRes.data || []);

    const validIds = (profilesRes.data || []).filter((u: any) => u.role === 'candidate').map((u: any) => u.id);
    const safeIds = validIds.length > 0 ? validIds : ['00000000-0000-0000-0000-000000000000'];
    const [countRes, idsRes] = await Promise.all([
      supabase.from('candidates').select('id', { count: 'exact', head: true }).not('invite_accepted_at', 'is', null).in('user_id', safeIds),
      supabase.from('candidates').select('user_id').not('invite_accepted_at', 'is', null).in('user_id', safeIds),
    ]);
    setTotalCandidates(countRes.count ?? 0);
    setCandidateAcceptedUserIds(new Set((idsRes.data || []).map((r: any) => r.user_id).filter(Boolean)));

    const counts: Record<string, number> = {};
    for (const a of assignRes.data || []) {
      counts[a.recruiter_id] = (counts[a.recruiter_id] || 0) + 1;
    }
    setAssignmentCounts(counts);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const channel = supabase.channel('users-page-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'candidates' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recruiter_candidate_assignments' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  const updateRole = async (id: string, role: string) => {
    await supabase.from('profiles').update({ role }).eq('id', id);
  };

  const deleteUser = async () => {
    if (!deleting) return;
    setDeleteLoading(true);

    // 1. Delete candidate rows linked by user_id
    await supabase.from('candidates').delete().eq('user_id', deleting.id);

    // 2. Delete orphaned candidate rows matched only by email
    if (deleting.email) {
      await supabase
        .from('candidates')
        .delete()
        .eq('email', deleting.email)
        .is('user_id', null);
    }

    // 3. Delete the profile itself
    await supabase.from('profiles').delete().eq('id', deleting.id);

    setDeleteLoading(false);
    setDeleting(null);
  };

  // Only show candidate-role users who have an accepted candidate record
  const displayUsers = users.filter(u => u.role !== 'candidate' || candidateAcceptedUserIds.has(u.id));

  const filtered = displayUsers.filter(u => {
    const matchSearch =
      u.name?.toLowerCase().includes(search.toLowerCase()) ||
      u.email?.toLowerCase().includes(search.toLowerCase()) ||
      u.company?.toLowerCase().includes(search.toLowerCase());
    return matchSearch && (filterRole === 'all' || u.role === filterRole);
  });

  const roleCount = (role: string) => displayUsers.filter(u => u.role === role).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 font-display">Users & Recruiters</h1>
          <p className="text-sm text-surface-500 mt-1">
            {roleCount('recruiter')} recruiters · {roleCount('admin')} admins · {roleCount('candidate')} candidates
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="btn-ghost text-sm"><RefreshCw size={14} /></button>
          <button onClick={() => setShowInvite(true)} className="btn-primary text-sm flex items-center gap-1.5">
            <Send size={14} /> Invite User
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle size={14} />{error}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Users', val: displayUsers.length, color: 'text-surface-900', sub: 'portal accounts' },
          { label: 'Recruiters', val: roleCount('recruiter'), color: 'text-brand-700', sub: 'with access' },
          { label: 'Admins', val: roleCount('admin'), color: 'text-purple-700', sub: 'with access' },
          { label: 'Candidates', val: totalCandidates, color: 'text-green-700', sub: 'total in system' },
        ].map(s => (
          <div key={s.label} className="card p-4 text-center">
            <p className={cn('text-2xl font-bold tabular-nums', s.color)}>{s.val}</p>
            <p className="text-xs text-surface-600 mt-0.5 font-medium">{s.label}</p>
            <p className="text-[10px] text-surface-400 mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Search name, email, company..." />
        <select value={filterRole} onChange={e => setFilterRole(e.target.value)}
          className="input text-sm w-full sm:w-36" aria-label="Filter by role">
          <option value="all">All roles</option>
          {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={28} /></div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={<UserCheck size={24} />} title="No users found"
          description={search ? 'Try a different search' : 'Invite your first recruiter or candidate'}
          action={<button onClick={() => setShowInvite(true)} className="btn-primary text-sm flex items-center gap-1.5"><Send size={14} /> Invite User</button>} />
      ) : (
        <div className="card overflow-hidden min-w-0">
          <div className="divide-y divide-surface-100 dark:divide-surface-600">
            {filtered.map(u => {
              const assignedCount = assignmentCounts[u.id] || 0;
              const isExpanded = expandedId === u.id;
              const canManageFeatures = u.role === 'candidate' || u.role === 'recruiter';
              return (
                <div key={u.id}>
                  <div className="flex items-center gap-4 px-5 py-3 hover:bg-surface-50 dark:hover:bg-surface-700/60 transition-colors group">
                    <div className={cn(
                      'w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0',
                      u.role === 'admin' ? 'bg-purple-100 text-purple-700' :
                        u.role === 'recruiter' ? 'bg-brand-100 text-brand-700' : 'bg-green-100 text-green-700'
                    )}>
                      {(u.name || u.email || '?')[0].toUpperCase()}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-surface-900">{u.name || '(no name yet)'}</p>
                        <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium',
                          u.role === 'admin' ? 'bg-purple-100 text-purple-700' :
                            u.role === 'recruiter' ? 'bg-brand-100 text-brand-700' : 'bg-green-100 text-green-700')}>
                          {u.role}
                        </span>
                        {u.is_active === false && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-600">Inactive</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-surface-500 flex-wrap">
                        <span className="flex items-center gap-1"><Mail size={10} />{u.email}</span>
                        {u.phone && <span className="flex items-center gap-1"><Phone size={10} />{u.phone}</span>}
                        {u.company && <span className="flex items-center gap-1"><Briefcase size={10} />{u.company}</span>}
                        {u.role === 'recruiter' && (
                          <span className="flex items-center gap-1 font-medium text-brand-600">
                            <Users size={10} />{assignedCount} assigned
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                      <select value={u.role} onChange={e => updateRole(u.id, e.target.value)}
                        className="input text-xs py-1 px-2 w-full sm:w-28" aria-label="Change role">
                        {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                      </select>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {canManageFeatures && (
                          <button
                            onClick={() => setFeatureUser(u)}
                            className="btn-ghost p-1.5 text-surface-400 hover:text-brand-600"
                            title="Manage feature access"
                          >
                            <Sliders size={13} />
                          </button>
                        )}
                        <button onClick={() => { setEditing(u); setShowEditForm(true); }}
                          className="btn-ghost p-1.5 text-surface-400 hover:text-brand-600"><Edit2 size={13} /></button>
                        <button onClick={() => setDeleting(u)}
                          className="btn-ghost p-1.5 text-surface-400 hover:text-red-600"><Trash2 size={13} /></button>
                      </div>
                      <button onClick={() => setExpandedId(isExpanded ? null : u.id)}
                        className="btn-ghost p-1.5 text-surface-300">
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="px-4 sm:px-8 md:px-16 py-3 bg-surface-50 dark:bg-surface-700/80 border-t border-surface-100 dark:border-surface-600 text-xs text-surface-600 grid grid-cols-2 md:grid-cols-3 gap-3">
                      {u.title && <div><span className="text-surface-400">Title</span><p className="font-medium mt-0.5">{u.title}</p></div>}
                      {u.timezone && <div><span className="text-surface-400">Timezone</span><p className="font-medium mt-0.5">{u.timezone}</p></div>}
                      <div><span className="text-surface-400">Joined</span><p className="font-medium mt-0.5">{formatRelative(u.created_at)}</p></div>
                      {u.bio && <div className="col-span-2 md:col-span-3"><span className="text-surface-400">Bio</span><p className="mt-0.5 text-surface-700">{u.bio}</p></div>}
                      {/* Feature access quick summary for eligible roles */}
                      {canManageFeatures && (
                        <div className="col-span-2 md:col-span-3 pt-2 border-t border-surface-200 dark:border-surface-600">
                          <button
                            onClick={() => setFeatureUser(u)}
                            className="flex items-center gap-2 text-brand-600 dark:text-brand-400 hover:underline font-medium"
                          >
                            <Sliders size={12} /> Manage feature access →
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showInvite && <InviteModal onClose={() => setShowInvite(false)} />}
      {showEditForm && editing && (
        <EditUserModal user={editing} onClose={() => { setShowEditForm(false); setEditing(null); }} onSaved={load} />
      )}
      {featureUser && (
        <FeatureAccessModal user={featureUser} onClose={() => setFeatureUser(null)} />
      )}

      {/* ── Delete Confirmation Modal ── */}
      {deleting && (
        <Modal open onClose={() => !deleteLoading && setDeleting(null)} title="Remove User" size="sm">
          <p className="text-sm text-surface-700 mb-4">
            Remove <strong>{deleting.name || deleting.email}</strong> from the system?
          </p>
          {deleting.role === 'candidate' && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
              ⚠️ This will also delete their candidate profile and all associated data,
              including any manually-created records with the same email.
            </p>
          )}
          <div className="flex justify-end gap-3">
            <button onClick={() => setDeleting(null)} disabled={deleteLoading} className="btn-secondary text-sm">Cancel</button>
            <button
              onClick={deleteUser}
              disabled={deleteLoading}
              className="btn-primary text-sm !bg-red-600 !border-red-600 flex items-center gap-2 min-w-[100px] justify-center"
            >
              {deleteLoading ? <Spinner size={14} /> : <Trash2 size={14} />}
              {deleteLoading ? 'Removing...' : 'Remove'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Invite Modal ─────────────────────────────────────────────────────────────
function InviteModal({ onClose }: { onClose: () => void }) {
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'candidate' | 'recruiter'>('candidate');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    if (!email) return;
    setSending(true); setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ email, role, name: name || undefined, phone: phone.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send invite');
      setSent(true);
    } catch (e: any) { setError(e.message); }
    setSending(false);
  };

  const reset = () => { setEmail(''); setName(''); setPhone(''); setRole('candidate'); setSent(false); setError(null); };

  return (
    <Modal open onClose={onClose} title="Invite User" size="sm">
      {sent ? (
        <div className="text-center py-6 space-y-3">
          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 size={24} className="text-green-600" />
          </div>
          <p className="text-sm font-semibold text-surface-900">Invite sent!</p>
          <p className="text-xs text-surface-500">
            A magic link was sent to <strong>{email}</strong>.<br />
            They&apos;ll be added as a <strong>{role}</strong> when they sign up.
          </p>
          <div className="flex justify-center gap-3 pt-2">
            <button onClick={reset} className="btn-secondary text-sm">Send another</button>
            <button onClick={onClose} className="btn-primary text-sm">Done</button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="label">Role</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {(['candidate', 'recruiter'] as const).map(r => (
                <button key={r} type="button" onClick={() => setRole(r)}
                  className={cn(
                    'py-3 px-4 rounded-xl border-2 text-sm font-medium text-left transition-colors',
                    role === r
                      ? r === 'candidate' ? 'border-green-400 bg-green-50 text-green-800' : 'border-brand-400 bg-brand-50 text-brand-800'
                      : 'border-surface-200 text-surface-600 hover:border-surface-300'
                  )}>
                  <p className="font-semibold capitalize">{r}</p>
                  <p className="text-[11px] opacity-70 mt-0.5">
                    {r === 'candidate' ? 'Job seeker — invite only, they set password via email' : 'Manages candidates'}
                  </p>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Email <span className="text-red-500">*</span></label>
            <input value={email} onChange={e => setEmail(e.target.value)} type="email"
              className="input text-sm" placeholder="person@example.com"
              onKeyDown={e => e.key === 'Enter' && send()} />
          </div>
          <div>
            <label className="label">Name <span className="text-surface-400 font-normal text-xs">optional</span></label>
            <input value={name} onChange={e => setName(e.target.value)} type="text"
              className="input text-sm" placeholder="Jane Smith" />
          </div>
          <div>
            <label className="label">Phone <span className="text-surface-400 font-normal text-xs">optional</span></label>
            <input value={phone} onChange={e => setPhone(e.target.value)} type="tel"
              className="input text-sm" placeholder="+1 555-0123" />
          </div>
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700 flex items-center gap-2">
              <AlertCircle size={13} /> {error}
            </div>
          )}
          <div className="flex justify-end gap-3 pt-1">
            <button onClick={onClose} className="btn-secondary text-sm">Cancel</button>
            <button onClick={send} disabled={sending || !email}
              className="btn-primary text-sm min-w-[120px] flex items-center justify-center gap-2">
              {sending ? <Spinner size={14} /> : <Send size={13} />} Send Invite
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ─── Edit User Modal ──────────────────────────────────────────────────────────
function EditUserModal({ user, onClose, onSaved }: { user: any; onClose: () => void; onSaved: () => void }) {
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [resetPasswordMessage, setResetPasswordMessage] = useState<'success' | 'error' | null>(null);
  const isCandidate = user?.role === 'candidate';

  const [form, setForm] = useState({
    name: user?.name || '', phone: user?.phone || '', title: user?.title || '',
    company: user?.company || '', linkedin_url: user?.linkedin_url || '',
    specializations: user?.specializations || [], timezone: user?.timezone || '',
    bio: user?.bio || '', internal_notes: user?.internal_notes || '',
    is_active: user?.is_active ?? true, role: user?.role || 'recruiter',
    resume_generation_allowed: user?.resume_generation_allowed ?? false,
  });
  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    setSaving(true); setSaveError(null);
    if (isCandidate) {
      const { error } = await supabase.from('profiles').update({
        name: form.name, phone: form.phone || null, is_active: form.is_active, role: form.role,
      }).eq('id', user.id);
      if (error) { setSaveError(error.message); setSaving(false); return; }
      const { data: cand } = await supabase.from('candidates').select('id').eq('user_id', user.id).maybeSingle();
      if (cand?.id) {
        await supabase.from('candidates').update({
          full_name: form.name,
          phone: form.phone || null,
          email: user.email,
          updated_at: new Date().toISOString(),
        }).eq('id', cand.id);
      }
    } else {
      const { error } = await supabase.from('profiles').update({
        name: form.name, phone: form.phone || null, title: form.title || null,
        company: form.company || null, linkedin_url: form.linkedin_url || null,
        specializations: form.specializations, timezone: form.timezone || null,
        bio: form.bio || null, internal_notes: form.internal_notes || null,
        is_active: form.is_active, role: form.role,
        resume_generation_allowed: form.role === 'recruiter' ? form.resume_generation_allowed : false,
      }).eq('id', user.id);
      if (error) { setSaveError(error.message); setSaving(false); return; }
    }
    setSaving(false); onSaved(); onClose();
  };

  const sendPasswordReset = async () => {
    setResettingPassword(true); setResetPasswordMessage(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/admin/send-password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ email: user.email }),
      });
      setResetPasswordMessage(res.ok ? 'success' : 'error');
    } catch {
      setResetPasswordMessage('error');
    }
    setResettingPassword(false);
  };

  return (
    <Modal open onClose={onClose} title={`Edit — ${user.name || user.email}`} size="lg">
      <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
        {isCandidate ? (
          <>
            <p className="text-xs text-surface-500 mb-2">Only name, email, phone and password can be edited here. All other candidate details are managed by the assigned recruiter.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Full Name</label>
                <input type="text" value={form.name} onChange={e => set('name', e.target.value)}
                  className="input text-sm" placeholder="Jane Smith" />
              </div>
              <div>
                <label className="label">Phone</label>
                <input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)}
                  className="input text-sm" placeholder="+1 555-0123" />
              </div>
              <div className="col-span-2">
                <label className="label">Email <span className="text-surface-400 font-normal text-xs">read-only</span></label>
                <input value={user.email} disabled className="input text-sm bg-surface-50 text-surface-400" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Role</label>
                <select value={form.role} onChange={e => set('role', e.target.value)}
                  className="input text-sm" aria-label="Role">
                  {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-3 pt-6">
                <button type="button" onClick={() => set('is_active', !form.is_active)}
                  className={cn('relative w-10 h-5 rounded-full transition-colors shrink-0', form.is_active ? 'bg-brand-600' : 'bg-surface-300')}>
                  <span className={cn('absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform', form.is_active ? 'translate-x-5' : 'translate-x-0.5')} />
                </button>
                <span className="text-sm text-surface-700">{form.is_active ? 'Active' : 'Inactive'}</span>
              </div>
            </div>
            <div className="pt-2 border-t border-surface-100">
              <label className="label">Password</label>
              <p className="text-xs text-surface-500 mb-2">Send a password reset email to this user. They will set a new password via the link.</p>
              <button type="button" onClick={sendPasswordReset} disabled={resettingPassword}
                className="btn-secondary text-sm flex items-center gap-2">
                {resettingPassword ? <Spinner size={14} /> : <Mail size={14} />}
                Send password reset email
              </button>
              {resetPasswordMessage === 'success' && <p className="text-xs text-green-600 mt-2">Reset email sent to {user.email}</p>}
              {resetPasswordMessage === 'error' && <p className="text-xs text-red-600 mt-2">Failed to send reset email. Try again.</p>}
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {([
                ['name', 'Full Name', 'text', 'Jane Smith'],
                ['phone', 'Phone', 'tel', '+1 555-0123'],
                ['title', 'Job Title', 'text', 'Senior Recruiter'],
                ['company', 'Company / Agency', 'text', 'TalentCo'],
              ] as [string, string, string, string][]).map(([key, label, type, placeholder]) => (
                <div key={key}>
                  <label className="label">{label}</label>
                  <input type={type} value={(form as any)[key]} onChange={e => set(key, e.target.value)}
                    className="input text-sm" placeholder={placeholder} />
                </div>
              ))}
              <div className="col-span-2">
                <label className="label">Email <span className="text-surface-400 font-normal text-xs">read-only</span></label>
                <input value={user.email} disabled className="input text-sm bg-surface-50 text-surface-400" />
              </div>
            </div>
            <div>
              <label className="label">Specializations</label>
              <TagInput value={form.specializations} onChange={v => set('specializations', v)} placeholder="Software Engineering..." />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {SPECIALIZATION_OPTIONS.map(s => (
                  <button key={s} type="button"
                    onClick={() => {
                      if (form.specializations.includes(s)) set('specializations', form.specializations.filter((x: string) => x !== s));
                      else set('specializations', [...form.specializations, s]);
                    }}
                    className={cn('px-2 py-1 rounded-md text-[11px] border transition-colors',
                      form.specializations.includes(s) ? 'bg-brand-100 text-brand-700 border-brand-300' : 'bg-white text-surface-600 border-surface-200 hover:border-brand-300')}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Timezone</label>
                <select value={form.timezone} onChange={e => set('timezone', e.target.value)}
                  className="input text-sm" aria-label="Timezone">
                  <option value="">— Select —</option>
                  {TIMEZONE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Role</label>
                <select value={form.role} onChange={e => set('role', e.target.value)}
                  className="input text-sm" aria-label="Role">
                  {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="label">Bio</label>
              <textarea value={form.bio} onChange={e => set('bio', e.target.value)}
                className="input text-sm h-20 resize-none" placeholder="Brief bio..." />
            </div>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => set('is_active', !form.is_active)}
                className={cn('relative w-10 h-5 rounded-full transition-colors shrink-0', form.is_active ? 'bg-brand-600' : 'bg-surface-300')}>
                <span className={cn('absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform', form.is_active ? 'translate-x-5' : 'translate-x-0.5')} />
              </button>
              <span className="text-sm text-surface-700 dark:text-surface-200">{form.is_active ? 'Active' : 'Inactive'}</span>
            </div>
            {form.role === 'recruiter' && (
              <div className="flex items-center gap-3 pt-2 border-t border-surface-200 dark:border-surface-600">
                <button type="button" onClick={() => set('resume_generation_allowed', !form.resume_generation_allowed)}
                  className={cn('relative w-10 h-5 rounded-full transition-colors shrink-0', form.resume_generation_allowed ? 'bg-brand-600' : 'bg-surface-300 dark:bg-surface-600')}>
                  <span className={cn('absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform', form.resume_generation_allowed ? 'translate-x-5' : 'translate-x-0.5')} />
                </button>
                <div>
                  <span className="text-sm font-medium text-surface-800 dark:text-surface-200">Resume generation allowed</span>
                  <p className="text-xs text-surface-500 dark:text-surface-400">When on, this recruiter can trigger AI resume generation for assigned candidates (only for matches with score &lt; 75).</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      {saveError && <p className="mt-3 text-xs text-red-600 flex items-center gap-1"><AlertCircle size={12} />{saveError}</p>}
      <div className="flex justify-end gap-3 mt-5 pt-4 border-t border-surface-200">
        <button onClick={onClose} className="btn-secondary text-sm">Cancel</button>
        <button onClick={handleSave} disabled={saving} className="btn-primary text-sm min-w-[80px]">
          {saving ? <Spinner size={14} /> : 'Update'}
        </button>
      </div>
    </Modal>
  );
}