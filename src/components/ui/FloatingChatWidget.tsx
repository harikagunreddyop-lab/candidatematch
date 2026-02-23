'use client';
import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { MessageCircle, X, ChevronLeft, Plus } from 'lucide-react';
import { cn } from '@/utils/helpers';
import { Spinner } from '@/components/ui';
import {
  ChatPanel, ConversationItem, OnlineDot,
  type Conversation, type ConversationParticipant,
} from './ChatComponents';
import type { Profile } from '@/types';

export default function FloatingChatWidget({ currentProfile }: { currentProfile: Profile }) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [totalUnread, setTotalUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showNewConv, setShowNewConv] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<Profile[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  const loadConversations = useCallback(async () => {
    setLoading(true);
    const { data: partRows } = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('profile_id', currentProfile.id);

    if (!partRows?.length) { setConversations([]); setLoading(false); return; }

    const convIds = partRows.map(r => r.conversation_id);

    const [convRes, partRes, msgRes, unreadRes] = await Promise.all([
      supabase.from('conversations').select('*').in('id', convIds).order('updated_at', { ascending: false }),
      supabase.from('conversation_participants')
        .select('*, profile:profiles!profile_id(id, name, email, role)')
        .in('conversation_id', convIds),
      supabase.from('messages').select('*').in('conversation_id', convIds)
        .order('created_at', { ascending: false }),
      supabase.from('conversation_participants')
        .select('conversation_id, last_read_at')
        .eq('profile_id', currentProfile.id)
        .in('conversation_id', convIds),
    ]);

    const participants: ConversationParticipant[] = partRes.data || [];
    const allMessages = msgRes.data || [];
    const myReadMap: Record<string, string | null> = {};
    for (const r of (unreadRes.data || [])) myReadMap[r.conversation_id] = r.last_read_at;

    let unreadTotal = 0;
    const convs: Conversation[] = (convRes.data || []).map(c => {
      const convParticipants = participants.filter(p => p.conversation_id === c.id);
      const convMessages = allMessages.filter(m => m.conversation_id === c.id);
      const lastMessage = convMessages[0] || null;
      const lastRead = myReadMap[c.id];
      const unread = lastRead
        ? convMessages.filter(m => m.sender_id !== currentProfile.id && new Date(m.created_at) > new Date(lastRead)).length
        : convMessages.filter(m => m.sender_id !== currentProfile.id).length;
      unreadTotal += unread;
      return { ...c, participants: convParticipants, last_message: lastMessage, unread_count: unread };
    });

    setConversations(convs);
    setTotalUnread(unreadTotal);
    setLoading(false);
  }, [currentProfile.id]);

  useEffect(() => {
    loadConversations();
    const channel = supabase
      .channel('widget-conversations')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => loadConversations())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, () => loadConversations())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadConversations]);

  const loadAvailableUsers = async () => {
    let query = supabase.from('profiles').select('*').neq('id', currentProfile.id);
    if (currentProfile.role === 'recruiter') {
      // Recruiter can only message their assigned candidates + admins
      const { data: assignments } = await supabase
        .from('recruiter_candidate_assignments')
        .select('candidate_id')
        .eq('recruiter_id', currentProfile.id);
      const candidateIds = (assignments || []).map((a: any) => a.candidate_id).filter(Boolean);
      const { data: candidateRows } = candidateIds.length
        ? await supabase.from('candidates').select('user_id').in('id', candidateIds)
        : { data: [] };
      const candidateUserIds = (candidateRows || []).map((c: any) => c.user_id).filter(Boolean);
      const [candidateProfilesRes, adminsRes] = await Promise.all([
        candidateUserIds.length ? supabase.from('profiles').select('*').in('id', candidateUserIds) : Promise.resolve({ data: [] }),
        supabase.from('profiles').select('*').eq('role', 'admin'),
      ]);
      const combined = [...(adminsRes.data || []), ...(candidateProfilesRes.data || [])];
      setAvailableUsers(combined.filter(u => u.id !== currentProfile.id));
      return;
    }
    if (currentProfile.role === 'candidate') {
      // Candidate can only message their assigned recruiters + admins
      const { data: myCand } = await supabase.from('candidates').select('id').eq('user_id', currentProfile.id).single();
      if (myCand) {
        const { data: assignments } = await supabase
          .from('recruiter_candidate_assignments')
          .select('recruiter_id')
          .eq('candidate_id', myCand.id);
        const recruiterIds = (assignments || []).map((a: any) => a.recruiter_id);
        const { data: admins } = await supabase.from('profiles').select('*').eq('role', 'admin');
        const { data: recruiters } = recruiterIds.length
          ? await supabase.from('profiles').select('*').in('id', recruiterIds)
          : { data: [] };
        setAvailableUsers([...(admins || []), ...(recruiters || [])]);
        return;
      }
    }
    // Admin can message anyone
    const { data } = await query.order('name');
    setAvailableUsers(data || []);
  };

  const createConversation = async () => {
    if (!selectedUsers.length) return;
    setCreating(true);
    const { data: conv } = await supabase.from('conversations').insert({
      created_by: currentProfile.id,
    }).select().single();

    if (conv) {
      const participants = [currentProfile.id, ...selectedUsers];
      await supabase.from('conversation_participants').insert(
        participants.map(pid => ({ conversation_id: conv.id, profile_id: pid }))
      );
      await loadConversations();
      setActiveConvId(conv.id);
      setShowNewConv(false);
      setSelectedUsers([]);
    }
    setCreating(false);
  };

  const activeConv = conversations.find(c => c.id === activeConvId);

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-brand-600 hover:bg-brand-700 shadow-elevated flex items-center justify-center text-white transition-all hover:scale-105 active:scale-95">
        {open ? <X size={22} /> : <MessageCircle size={22} />}
        {!open && totalUnread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-red-500 text-white text-[11px] font-bold flex items-center justify-center">
            {totalUnread > 99 ? '99+' : totalUnread}
          </span>
        )}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-[380px] h-[560px] bg-white dark:bg-surface-800 rounded-2xl shadow-modal border border-surface-200 dark:border-surface-600 flex flex-col overflow-hidden animate-slide-up">

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-surface-200 bg-brand-600 text-white rounded-t-2xl shrink-0">
            <div className="flex items-center gap-2">
              {activeConvId && (
                <button onClick={() => setActiveConvId(null)} className="hover:opacity-80 transition-opacity">
                  <ChevronLeft size={18} />
                </button>
              )}
              <span className="font-semibold text-sm">
                {activeConvId ? (activeConv?.title || 'Conversation') : 'Messages'}
              </span>
              {!activeConvId && totalUnread > 0 && (
                <span className="bg-white/20 text-white text-xs px-1.5 py-0.5 rounded-full font-medium">{totalUnread}</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {!activeConvId && (
                <button onClick={() => { setShowNewConv(true); loadAvailableUsers(); }}
                  className="hover:bg-white/20 p-1.5 rounded-lg transition-colors" title="New conversation">
                  <Plus size={16} />
                </button>
              )}
              <button onClick={() => setOpen(false)} className="hover:bg-white/20 p-1.5 rounded-lg transition-colors">
                <X size={16} />
              </button>
            </div>
          </div>

          {/* New conversation picker */}
          {showNewConv && !activeConvId && (
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <p className="text-xs font-semibold text-surface-500 dark:text-surface-300 uppercase tracking-wide">Select people to message</p>
              {availableUsers.length === 0 && (
                <p className="text-sm text-surface-400 dark:text-surface-300">No users available to message.</p>
              )}
              {availableUsers.map(u => (
                <label key={u.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-surface-50 cursor-pointer">
                  <input type="checkbox"
                    checked={selectedUsers.includes(u.id)}
                    onChange={e => setSelectedUsers(prev =>
                      e.target.checked ? [...prev, u.id] : prev.filter(id => id !== u.id)
                    )}
                    className="rounded border-surface-300 text-brand-600" />
                  <div className="relative shrink-0">
                    <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold text-sm">
                      {(u.name || u.email || '?')[0].toUpperCase()}
                    </div>
                    <div className="absolute -bottom-0.5 -right-0.5">
                      <OnlineDot profileId={u.id} />
                    </div>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-surface-800 dark:text-surface-100 truncate">{u.name || u.email}</p>
                    <p className="text-xs text-surface-400 dark:text-surface-300 capitalize">{u.role}</p>
                  </div>
                </label>
              ))}
              <div className="flex gap-2 pt-2">
                <button onClick={() => { setShowNewConv(false); setSelectedUsers([]); }}
                  className="btn-secondary text-sm flex-1">Cancel</button>
                <button onClick={createConversation} disabled={!selectedUsers.length || creating}
                  className="btn-primary text-sm flex-1">
                  {creating ? <Spinner size={14} /> : 'Start Chat'}
                </button>
              </div>
            </div>
          )}

          {/* Conversation list */}
          {!showNewConv && !activeConvId && (
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center h-full"><Spinner size={20} /></div>
              ) : conversations.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
                  <MessageCircle size={32} className="text-surface-300" />
                  <p className="text-sm text-surface-500 dark:text-surface-300">No conversations yet</p>
                  <button onClick={() => { setShowNewConv(true); loadAvailableUsers(); }}
                    className="btn-primary text-sm flex items-center gap-1.5">
                    <Plus size={14} /> Start a conversation
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-surface-50">
                  {conversations.map(conv => (
                    <ConversationItem
                      key={conv.id}
                      conv={conv}
                      active={false}
                      onClick={() => setActiveConvId(conv.id)}
                      currentProfileId={currentProfile.id}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Active chat */}
          {activeConvId && !showNewConv && (
            <div className="flex-1 overflow-hidden">
              <ChatPanel
                conversationId={activeConvId}
                currentProfile={currentProfile}
                onUnreadChange={loadConversations}
              />
            </div>
          )}
        </div>
      )}
    </>
  );
}