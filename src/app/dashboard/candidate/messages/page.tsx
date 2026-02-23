'use client';
import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { useProfile } from '@/hooks';
import { Spinner, SearchInput } from '@/components/ui';
import { MessageCircle, Plus, X, ArrowLeft } from 'lucide-react';
import { cn } from '@/utils/helpers';
import {
  ChatPanel, ConversationItem, OnlineDot,
  type Conversation, type ConversationParticipant,
} from '@/components/ui/ChatComponents';
import type { Profile } from '@/types';

export default function CandidateMessagesPage() {
  const { profile, loading: profileLoading } = useProfile();
  const supabase = createClient();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showNewConv, setShowNewConv] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<Profile[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

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
    let timeout: ReturnType<typeof setTimeout>;
    const scheduleReload = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => loadConversations(), 400);
    };
    const channel = supabase.channel('candidate-messages-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversation_participants' }, scheduleReload)
      .subscribe();
    return () => {
      clearTimeout(timeout);
      supabase.removeChannel(channel);
    };
  }, [profile, loadConversations]);

  const loadAvailableUsers = async () => {
    if (!profile) return;

    const { data: myCand } = await supabase
      .from('candidates')
      .select('id')
      .eq('user_id', profile.id)
      .single();

    const { data: admins } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'admin');
    const adminList = (admins || []).filter((u: any) => u.id !== profile.id);

    if (!myCand) {
      setAvailableUsers(adminList);
      return;
    }

    const { data: assignments } = await supabase
      .from('recruiter_candidate_assignments')
      .select('recruiter_id')
      .eq('candidate_id', myCand.id);
    const recruiterIds = (assignments || []).map((a: any) => a.recruiter_id).filter(Boolean) as string[];

    let recruiterProfiles: Profile[] = [];
    if (recruiterIds.length > 0) {
      const { data: profileRows } = await supabase
        .from('profiles')
        .select('*')
        .in('id', recruiterIds);
      recruiterProfiles = profileRows || [];

      const foundIds = new Set(recruiterProfiles.map(p => p.id));
      const missing: Profile[] = recruiterIds
        .filter(rid => !foundIds.has(rid))
        .map(rid => ({
          id: rid,
          name: 'Recruiter',
          email: '',
          role: 'recruiter' as const,
          created_at: '',
          updated_at: '',
        }));
      recruiterProfiles = [...recruiterProfiles, ...missing];
    }

    const seen = new Set<string>();
    const merged = [...recruiterProfiles, ...adminList].filter(u => {
      if (u.id === profile.id || seen.has(u.id)) return false;
      seen.add(u.id);
      return true;
    });

    setAvailableUsers(merged);
  };

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
          <h1 className="text-2xl font-bold text-surface-900 font-display">Messages</h1>
          <p className="text-sm text-surface-500 mt-1">
            Chat with your recruiter {totalUnread > 0 && <span className="text-brand-600 font-medium">· {totalUnread} unread</span>}
          </p>
        </div>
        <button onClick={() => { setShowNewConv(true); loadAvailableUsers(); }}
          className="btn-primary text-sm flex items-center gap-1.5">
          <Plus size={16} /> New Message
        </button>
      </div>

      <div className="h-[calc(100vh-180px)] sm:h-[calc(100vh-200px)] bg-surface-800 rounded-2xl border border-surface-600 shadow-sm overflow-hidden flex">
        {/* Sidebar */}
        <div className={cn(
          'border-r border-surface-700 flex flex-col shrink-0',
          'w-full md:w-72',
          activeConvId || showNewConv ? 'hidden md:flex' : 'flex'
        )}>
          <div className="p-3 border-b border-surface-700">
            <SearchInput value={search} onChange={setSearch} placeholder="Search..." />
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-32"><Spinner size={20} /></div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 gap-2 px-4 text-center">
                <MessageCircle size={28} className="text-surface-300" />
                <p className="text-sm text-surface-400">No conversations yet</p>
                <button onClick={() => { setShowNewConv(true); loadAvailableUsers(); }}
                  className="btn-primary text-xs flex items-center gap-1"><Plus size={12} />Message recruiter</button>
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
        <div className={cn(
          'flex-1 overflow-hidden flex flex-col',
          !activeConvId && !showNewConv ? 'hidden md:flex' : 'flex'
        )}>
          {showNewConv ? (
            <div className="h-full overflow-y-auto p-4 sm:p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <button onClick={() => { setShowNewConv(false); setSelectedUsers([]); }} className="md:hidden p-1.5 rounded-lg hover:bg-surface-700 text-surface-400"><ArrowLeft size={18} /></button>
                  <h3 className="font-semibold text-surface-900">New Message</h3>
                </div>
                <button onClick={() => { setShowNewConv(false); setSelectedUsers([]); }} className="btn-ghost p-1.5"><X size={16} /></button>
              </div>
              <p className="text-xs font-semibold text-surface-400 uppercase tracking-wide mb-3">Your recruiters & support</p>
              <div className="space-y-1 mb-6">
                {availableUsers.length === 0 && (
                  <p className="text-sm text-surface-400">No recruiter assigned yet. Contact your admin.</p>
                )}
                {availableUsers.map(u => (
                  <label key={u.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-surface-50 cursor-pointer">
                    <input type="checkbox" checked={selectedUsers.includes(u.id)}
                      onChange={e => setSelectedUsers(prev => e.target.checked ? [...prev, u.id] : prev.filter(id => id !== u.id))}
                      className="rounded border-surface-300 text-brand-600" />
                    <div className="relative shrink-0">
                      <div className="w-8 h-8 rounded-full bg-brand-600/20 flex items-center justify-center text-brand-300 font-bold text-sm">
                        {(u.name || u.email || '?')[0].toUpperCase()}
                      </div>
                      <div className="absolute -bottom-0.5 -right-0.5"><OnlineDot profileId={u.id} /></div>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-surface-200">{u.name || u.email}</p>
                      <p className="text-xs text-surface-400 capitalize">{u.role}</p>
                    </div>
                  </label>
                ))}
              </div>
              <div className="flex gap-3">
                <button onClick={() => { setShowNewConv(false); setSelectedUsers([]); }} className="btn-secondary flex-1">Cancel</button>
                <button onClick={createConversation} disabled={!selectedUsers.length || creating} className="btn-primary flex-1">
                  {creating ? <Spinner size={14} /> : 'Start Chat'}
                </button>
              </div>
            </div>
          ) : activeConvId ? (
            <div className="flex flex-col h-full">
              <button onClick={() => setActiveConvId(null)} className="md:hidden flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-surface-300 hover:text-white border-b border-surface-700 shrink-0">
                <ArrowLeft size={16} /> Back to conversations
              </button>
              <div className="flex-1 min-h-0">
                <ChatPanel conversationId={activeConvId} currentProfile={profile} onUnreadChange={loadConversations} />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
                <div className="w-16 h-16 rounded-2xl bg-brand-600/10 flex items-center justify-center">
                <MessageCircle size={28} className="text-brand-400" />
              </div>
              <p className="text-surface-200 font-medium">Select a conversation</p>
              <p className="text-sm text-surface-400">Chat with your assigned recruiter or support team</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}