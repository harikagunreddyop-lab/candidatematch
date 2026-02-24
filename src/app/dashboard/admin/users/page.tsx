'use client';
// src/app/dashboard/admin/users/page.tsx
import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { SearchInput, EmptyState, Spinner, Modal } from '@/components/ui';
import {
  UserCheck, Plus, RefreshCw, AlertCircle, Edit2, Trash2,
  X, Mail, Phone, Briefcase, Users, ChevronDown, ChevronUp,
  Send, CheckCircle2,
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
    //    (manually created candidates have user_id = null — these are missed by step 1)
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

  // Only show candidate-role users who have an accepted candidate record (matches Candidates page)
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