'use client';
import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { useProfile } from '@/hooks';
import { Spinner, SearchInput } from '@/components/ui';
import { MessageCircle, Plus, X } from 'lucide-react';
import {
  ChatPanel, ConversationItem, OnlineDot,
  type Conversation, type ConversationParticipant,
} from '@/components/ui/ChatComponents';
import type { Profile } from '@/types';

/** Messageable user or assigned candidate not yet signed in (shown disabled). */
type ListUser = Profile & { notSignedIn?: boolean };

export default function RecruiterMessagesPage() {
  const { profile, loading: profileLoading } = useProfile();
  const supabase = createClient();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showNewConv, setShowNewConv] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<ListUser[]>([]);
  const [availableUsersHint, setAvailableUsersHint] = useState<string | null>(null);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const loadConversations = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const { data: partRows } = await supabase
      .from('conversation_participants').select('conversation_id').eq('profile_id', profile.id);
    if (!partRows?.length) { setConversations([]); setLoading(false); return; }

    const convIds = partRows.map(r => r.conversation_id);
    const [convRes, partRes, msgRes, unreadRes] = await Promise.all([
      supabase.from('conversations').select('*').in('id', convIds).order('updated_at', { ascending: false }),
      supabase.from('conversation_participants')
        .select('*, profile:profiles!profile_id(id, name, email, role)')
        .in('conversation_id', convIds),
      supabase.from('messages').select('*').in('conversation_id', convIds).order('created_at', { ascending: false }),
      supabase.from('conversation_participants')
        .select('conversation_id, last_read_at').eq('profile_id', profile.id).in('conversation_id', convIds),
    ]);

    const participants: ConversationParticipant[] = partRes.data || [];
    const allMessages = msgRes.data || [];
    const myReadMap: Record<string, string | null> = {};
    for (const r of (unreadRes.data || [])) myReadMap[r.conversation_id] = r.last_read_at;

    const convs: Conversation[] = (convRes.data || []).map(c => {
      const convParticipants = participants.filter(p => p.conversation_id === c.id);
      const convMessages = allMessages.filter(m => m.conversation_id === c.id);
      const lastRead = myReadMap[c.id];
      const unread = lastRead
        ? convMessages.filter(m => m.sender_id !== profile.id && new Date(m.created_at) > new Date(lastRead)).length
        : convMessages.filter(m => m.sender_id !== profile.id).length;
      return { ...c, participants: convParticipants, last_message: convMessages[0] || null, unread_count: unread };
    });
    setConversations(convs);
    setLoading(false);
  }, [profile]);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  useEffect(() => {
    if (!profile) return;
    const channel = supabase.channel('recruiter-messages-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => loadConversations())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, () => loadConversations())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile, loadConversations]);

  const loadAvailableUsers = useCallback(async () => {
    if (!profile) return;
    setLoadingUsers(true);
    setAvailableUsersHint(null);
    try {
      // 1) Get assigned candidate IDs for this recruiter
      const { data: assignments, error: assignErr } = await supabase
        .from('recruiter_candidate_assignments')
        .select('candidate_id')
        .eq('recruiter_id', profile.id);
      if (assignErr) {
        setAvailableUsers([]);
        setAvailableUsersHint('Could not load assignments.');
        setLoadingUsers(false);
        return;
      }
      const candidateIds = (assignments || []).map((a: any) => a.candidate_id).filter(Boolean);
      const { data: admins } = await supabase.from('profiles').select('*').eq('role', 'admin');
      const adminList = (admins || []).filter((u: any) => u.id !== profile.id) as ListUser[];

      if (candidateIds.length === 0) {
        setAvailableUsers(adminList);
        if (adminList.length === 0) {
          setAvailableUsersHint('No candidates assigned yet. Ask an admin to assign candidates to you, or message an admin below.');
        }
        setLoadingUsers(false);
        return;
      }
      // 2) Get assigned candidates (id, user_id, full_name, email) so we can show all assigned
      const { data: candidateRows } = await supabase
        .from('candidates')
        .select('id, user_id, full_name, email')
        .in('id', candidateIds);
      const rows = candidateRows || [];
      const userIds = rows.map((c: any) => c.user_id).filter(Boolean) as string[];
      const assignedWithoutAccount = rows.filter((c: any) => !c.user_id);
      const notSignedInEntries: ListUser[] = assignedWithoutAccount.map((c: any) => ({
        id: `candidate-${c.id}`,
        name: c.full_name ?? 'Candidate',
        email: c.email ?? '',
        role: 'candidate',
        created_at: '',
        updated_at: '',
        notSignedIn: true,
      }));

      if (userIds.length === 0) {
        setAvailableUsers([...notSignedInEntries, ...adminList]);
        setAvailableUsersHint(
          notSignedInEntries.length > 0
            ? 'Your assigned candidate(s) have not signed in yet. They need to sign in (or use the invite link from admin) before you can message them. You can still message admins below.'
            : 'No messageable users found.'
        );
        setLoadingUsers(false);
        return;
      }
      const { data: profileRows } = await supabase.from('profiles').select('*').in('id', userIds);
      const candidateProfiles = (profileRows || []) as ListUser[];

      const foundProfileIds = new Set(candidateProfiles.map(p => p.id));
      const missingFromProfiles: ListUser[] = rows
        .filter((c: any) => c.user_id && !foundProfileIds.has(c.user_id))
        .map((c: any) => ({
          id: c.user_id,
          name: c.full_name ?? 'Candidate',
          email: c.email ?? '',
          role: 'candidate' as const,
          created_at: '',
          updated_at: '',
        }));

      const combined = [...candidateProfiles, ...missingFromProfiles, ...notSignedInEntries, ...adminList];
      const seen = new Set<string>();
      setAvailableUsers(combined.filter(u => { if (seen.has(u.id)) return false; seen.add(u.id); return true; }));
      if (notSignedInEntries.length > 0) {
        setAvailableUsersHint(`${notSignedInEntries.length} assigned candidate(s) have not signed in yet and cannot be messaged.`);
      }
    } finally {
      setLoadingUsers(false);
    }
  }, [profile]);

  const createConversation = async () => {
    if (!profile || !selectedUsers.length) return;
    setCreating(true);
    const { data: conv } = await supabase.from('conversations').insert({ created_by: profile.id }).select().single();
    if (conv) {
      await supabase.from('conversation_participants').insert(
        [profile.id, ...selectedUsers].map(pid => ({ conversation_id: conv.id, profile_id: pid }))
      );
      await loadConversations();
      setActiveConvId(conv.id);
      setShowNewConv(false);
      setSelectedUsers([]);
    }
    setCreating(false);
  };

  const filtered = conversations.filter(c => {
    if (!search) return true;
    const others = c.participants?.filter(p => p.profile_id !== profile?.id) || [];
    return others.some(p =>
      p.profile?.name?.toLowerCase().includes(search.toLowerCase()) ||
      p.profile?.email?.toLowerCase().includes(search.toLowerCase())
    );
  });

  const totalUnread = conversations.reduce((a, c) => a + (c.unread_count || 0), 0);

  if (profileLoading) return <div className="flex justify-center py-20"><Spinner size={28} /></div>;
  if (!profile) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-100 font-display">Messages</h1>
          <p className="text-sm text-surface-500 dark:text-surface-300 mt-1">
            Your conversations {totalUnread > 0 && <span className="text-brand-600 font-medium">· {totalUnread} unread</span>}
          </p>
        </div>
        <button onClick={() => { setShowNewConv(true); loadAvailableUsers(); }}
          className="btn-primary text-sm flex items-center gap-1.5">
          <Plus size={16} /> New Conversation
        </button>
      </div>

      <div className="h-[calc(100vh-200px)] bg-white dark:bg-surface-800 rounded-2xl border border-surface-200 dark:border-surface-600 shadow-sm overflow-hidden flex">
        {/* Sidebar */}
        <div className="w-72 border-r border-surface-200 dark:border-surface-600 flex flex-col shrink-0">
          <div className="p-3 border-b border-surface-200 dark:border-surface-600">
            <SearchInput value={search} onChange={setSearch} placeholder="Search..." />
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-32"><Spinner size={20} /></div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 gap-2 px-4 text-center">
                <MessageCircle size={28} className="text-surface-300" />
                <p className="text-sm text-surface-400 dark:text-surface-300">No conversations yet</p>
                <button onClick={() => { setShowNewConv(true); loadAvailableUsers(); }}
                  className="btn-primary text-xs flex items-center gap-1"><Plus size={12} />Start one</button>
              </div>
            ) : (
              <div className="divide-y divide-surface-50">
                {filtered.map(conv => (
                  <ConversationItem key={conv.id} conv={conv} active={activeConvId === conv.id}
                    onClick={() => setActiveConvId(conv.id)} currentProfileId={profile.id} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Chat / New conv */}
        <div className="flex-1 overflow-hidden">
          {showNewConv ? (
            <div className="h-full overflow-y-auto p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-surface-900 dark:text-surface-100">New Conversation</h3>
                <button onClick={() => { setShowNewConv(false); setSelectedUsers([]); }} className="btn-ghost p-1.5"><X size={16} /></button>
              </div>
              <p className="text-xs font-semibold text-surface-400 dark:text-surface-300 uppercase tracking-wide mb-3">Your candidates & admins</p>
              {loadingUsers ? (
                <div className="flex items-center gap-2 py-6 text-surface-500 dark:text-surface-400">
                  <Spinner size={18} />
                  <span className="text-sm">Loading people you can message…</span>
                </div>
              ) : (
              <>
              {availableUsersHint && (
                <p className="text-sm text-amber-700 dark:text-amber-200 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-lg px-3 py-2 mb-3">{availableUsersHint}</p>
              )}
              <div className="space-y-1 mb-6">
                {availableUsers.length === 0 && (
                  <p className="text-sm text-surface-500 dark:text-surface-400 py-2">
                    No one to message yet. Get an admin to assign you candidates, or they can invite candidates who will then appear here once they sign in.
                  </p>
                )}
                {availableUsers.map(u => (
                  <label
                    key={u.id}
                    className={`flex items-center gap-3 p-2 rounded-xl ${u.notSignedIn ? 'opacity-70 cursor-default' : 'hover:bg-surface-50 dark:hover:bg-surface-700 cursor-pointer'}`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedUsers.includes(u.id)}
                      disabled={!!u.notSignedIn}
                      onChange={e => !u.notSignedIn && setSelectedUsers(prev => e.target.checked ? [...prev, u.id] : prev.filter(id => id !== u.id))}
                      className="rounded border-surface-300 text-brand-600 disabled:opacity-50"
                    />
                    <div className="relative shrink-0">
                      <div className="w-8 h-8 rounded-full bg-brand-100 dark:bg-brand-500/20 flex items-center justify-center text-brand-700 dark:text-brand-300 font-bold text-sm">
                        {(u.name || u.email || '?')[0].toUpperCase()}
                      </div>
                      {!u.notSignedIn && <div className="absolute -bottom-0.5 -right-0.5"><OnlineDot profileId={u.id} /></div>}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-surface-800 dark:text-surface-100">{u.name || u.email}</p>
                      <p className="text-xs text-surface-400 dark:text-surface-300">{u.notSignedIn ? 'Not signed in yet' : u.role}</p>
                    </div>
                  </label>
                ))}
              </div>
              </>
              )}
              <div className="flex gap-3">
                <button onClick={() => { setShowNewConv(false); setSelectedUsers([]); }} className="btn-secondary flex-1">Cancel</button>
                <button onClick={createConversation} disabled={!selectedUsers.length || creating} className="btn-primary flex-1">
                  {creating ? <Spinner size={14} /> : 'Start Chat'}
                </button>
              </div>
            </div>
          ) : activeConvId ? (
            <ChatPanel conversationId={activeConvId} currentProfile={profile} onUnreadChange={loadConversations} />
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
              <div className="w-16 h-16 rounded-2xl bg-brand-600/10 flex items-center justify-center">
                <MessageCircle size={28} className="text-brand-400" />
              </div>
              <p className="text-surface-800 dark:text-surface-100 font-medium">Select a conversation</p>
              <p className="text-sm text-surface-400 dark:text-surface-300">Message your assigned candidates or the admin team</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}