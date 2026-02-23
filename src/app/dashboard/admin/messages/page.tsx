'use client';
import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { useProfile } from '@/hooks';
import { Spinner, SearchInput } from '@/components/ui';
import { MessageCircle, Plus, X, AlertCircle, ArrowLeft } from 'lucide-react';
import { cn } from '@/utils/helpers';
import {
  ChatPanel, ConversationItem, OnlineDot,
  type Conversation, type ConversationParticipant,
} from '@/components/ui/ChatComponents';
import type { Profile } from '@/types';

export default function AdminMessagesPage() {
  const { profile, loading: profileLoading } = useProfile();
  const [supabase, setSupabase] = useState<ReturnType<typeof createClient> | null>(null);
  useEffect(() => {
    setSupabase(createClient());
  }, []);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showNewConv, setShowNewConv] = useState(false);
  const [allUsers, setAllUsers] = useState<Profile[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadConversations = useCallback(async () => {
    if (!profile || !supabase) return;
    setLoading(true);
    setLoadError(null);

    const { data: convRes, error: convErr } = await supabase
      .from('conversations')
      .select('*')
      .order('updated_at', { ascending: false });

    if (convErr) {
      setLoadError(convErr.message || 'Failed to load conversations');
      setConversations([]);
      setLoading(false);
      return;
    }

    if (!convRes?.length) { setConversations([]); setLoading(false); return; }

    const convIds = convRes.map(c => c.id);
    const [partRes, msgRes, unreadRes] = await Promise.all([
      supabase.from('conversation_participants')
        .select('*, profile:profiles!profile_id(id, name, email, role)')
        .in('conversation_id', convIds),
      supabase.from('messages').select('*').in('conversation_id', convIds)
        .order('created_at', { ascending: false }),
      supabase.from('conversation_participants')
        .select('conversation_id, last_read_at')
        .eq('profile_id', profile.id)
        .in('conversation_id', convIds),
    ]);

    if (partRes.error || msgRes.error || unreadRes.error) {
      setLoadError(partRes.error?.message || msgRes.error?.message || unreadRes.error?.message || 'Failed to load conversations');
      setConversations([]);
      setLoading(false);
      return;
    }

    const participants: ConversationParticipant[] = partRes.data || [];
    const allMessages = msgRes.data || [];
    const myReadMap: Record<string, string | null> = {};
    for (const r of (unreadRes.data || [])) myReadMap[r.conversation_id] = r.last_read_at;

    const convs: Conversation[] = convRes.map(c => {
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
  }, [profile, supabase]);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  useEffect(() => {
    if (!profile || !supabase) return;
    let timeout: ReturnType<typeof setTimeout>;
    const scheduleReload = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => loadConversations(), 400);
    };
    const channel = supabase
      .channel('admin-messages-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, scheduleReload)
      .subscribe();
    return () => {
      clearTimeout(timeout);
      supabase.removeChannel(channel);
    };
  }, [profile, supabase, loadConversations]);

  const loadAllUsers = async () => {
    if (!profile || !supabase) return;
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .neq('id', profile.id)
      .order('role')
      .order('name');
    if (error) console.error('[loadAllUsers] error:', error);
    setAllUsers(data || []);
  };

  const createConversation = async () => {
    if (!profile || !supabase || !selectedUsers.length) return;
    setCreating(true);
    setCreateError(null);

    // Step 1 — insert conversation row
    const { data: conv, error: convErr } = await supabase
      .from('conversations')
      .insert({ created_by: profile.id })
      .select()
      .single();

    if (convErr) {
      console.error('[createConversation] step1 error:', convErr);
      setCreateError(`Failed to create conversation: ${convErr.message}`);
      setCreating(false);
      return;
    }

    // Step 2 — add participants (deduplicated — trigger may have already added admins)
    const participantIds = Array.from(new Set([profile.id, ...selectedUsers]));
    const { error: partErr } = await supabase
      .from('conversation_participants')
      .upsert(
        participantIds.map(pid => ({ conversation_id: conv.id, profile_id: pid })),
        { onConflict: 'conversation_id,profile_id' }
      );

    if (partErr) {
      console.error('[createConversation] step2 error:', partErr);
      // Conversation exists — still navigate to it, just show warning
      setCreateError(`Participants partially added: ${partErr.message}`);
    }

    await loadConversations();
    setActiveConvId(conv.id);
    setShowNewConv(false);
    setSelectedUsers([]);
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

  if (profileLoading || !supabase) return <div className="flex justify-center py-20"><Spinner size={28} /></div>;
  if (!profile) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 font-display">Messages</h1>
          <p className="text-sm text-surface-500 mt-1">
            All conversations {totalUnread > 0 && <span className="text-brand-600 font-medium">· {totalUnread} unread</span>}
          </p>
        </div>
        <button onClick={() => { setShowNewConv(true); setCreateError(null); loadAllUsers(); }}
          className="btn-primary text-sm flex items-center gap-1.5">
          <Plus size={16} /> New Conversation
        </button>
      </div>

      <div className="h-[calc(100vh-180px)] sm:h-[calc(100vh-200px)] bg-surface-800 rounded-2xl border border-surface-600 shadow-sm overflow-hidden flex">

        {/* Sidebar */}
        <div className={cn(
          'border-r border-surface-700 flex flex-col shrink-0',
          'w-full md:w-80',
          activeConvId || showNewConv ? 'hidden md:flex' : 'flex'
        )}>
          <div className="p-3 border-b border-surface-700">
            <SearchInput value={search} onChange={setSearch} placeholder="Search conversations..." />
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-32"><Spinner size={20} /></div>
            ) : loadError ? (
              <div className="flex flex-col items-center justify-center h-48 gap-2 text-center px-4">
                <AlertCircle size={24} className="text-red-500" />
                <p className="text-sm text-surface-600">{loadError}</p>
                <button type="button" onClick={() => loadConversations()} className="btn-secondary text-sm">Try again</button>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 gap-2 text-center px-4">
                <MessageCircle size={28} className="text-surface-300" />
                <p className="text-sm text-surface-400">{search ? 'No results' : 'No conversations yet'}</p>
              </div>
            ) : (
              <div className="divide-y divide-surface-50">
                {filtered.map(conv => (
                  <ConversationItem
                    key={conv.id}
                    conv={conv}
                    active={activeConvId === conv.id}
                    onClick={() => { setShowNewConv(false); setActiveConvId(conv.id); }}
                    currentProfileId={profile.id}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Main area */}
        <div className={cn(
          'flex-1 overflow-hidden flex flex-col',
          !activeConvId && !showNewConv ? 'hidden md:flex' : 'flex'
        )}>
          {showNewConv ? (
            <div className="h-full overflow-y-auto p-4 sm:p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <button onClick={() => { setShowNewConv(false); setSelectedUsers([]); setCreateError(null); }} className="md:hidden p-1.5 rounded-lg hover:bg-surface-700 text-surface-400"><ArrowLeft size={18} /></button>
                  <h3 className="font-semibold text-surface-900">New Conversation</h3>
                </div>
                <button onClick={() => { setShowNewConv(false); setSelectedUsers([]); setCreateError(null); }}
                  className="btn-ghost p-1.5"><X size={16} /></button>
              </div>

              {/* Error banner */}
              {createError && (
                <div className="mb-4 rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400 flex items-start gap-2">
                  <AlertCircle size={15} className="shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">Something went wrong</p>
                    <p className="mt-0.5">{createError}</p>
                    <p className="mt-1 text-xs text-red-500">Check the browser console (F12) for more details.</p>
                  </div>
                </div>
              )}

              <p className="text-xs font-semibold text-surface-400 uppercase tracking-wide mb-3">
                Select participants {selectedUsers.length > 0 && `(${selectedUsers.length} selected)`}
              </p>

              {allUsers.length === 0 ? (
                <div className="flex items-center justify-center py-8 gap-2 text-surface-400">
                  <Spinner size={16} /> <span className="text-sm">Loading users...</span>
                </div>
              ) : (
                <div className="mb-20">
                  {(['admin', 'recruiter', 'candidate'] as const).map(role => {
                    const roleUsers = allUsers.filter(u => u.role === role);
                    if (!roleUsers.length) return null;
                    return (
                      <div key={role} className="mb-4">
                        <p className="text-[11px] font-semibold text-surface-400 uppercase tracking-wider px-2 py-1.5">
                          {role}s
                        </p>
                        {roleUsers.map(u => (
                          <label key={u.id}
                            className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-surface-50 cursor-pointer transition-colors">
                            <input type="checkbox"
                              checked={selectedUsers.includes(u.id)}
                              onChange={e => setSelectedUsers(prev =>
                                e.target.checked ? [...prev, u.id] : prev.filter(id => id !== u.id)
                              )}
                              className="rounded border-surface-300 text-brand-600 focus:ring-brand-500" />
                            <div className="relative shrink-0">
                              <div className={cn(
                                'w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm',
                                role === 'admin' ? 'bg-purple-600/20 text-purple-300'
                                : role === 'recruiter' ? 'bg-brand-600/20 text-brand-300'
                                : 'bg-green-600/20 text-green-300'
                              )}>
                                {(u.name || u.email || '?')[0].toUpperCase()}
                              </div>
                              <div className="absolute -bottom-0.5 -right-0.5">
                                <OnlineDot profileId={u.id} />
                              </div>
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-surface-800 truncate">{u.name || '(no name)'}</p>
                              <p className="text-xs text-surface-400 truncate">{u.email}</p>
                            </div>
                          </label>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Sticky footer buttons */}
              <div className="sticky bottom-0 bg-surface-800 border-t border-surface-700 pt-3 flex gap-3">
                <button
                  onClick={() => { setShowNewConv(false); setSelectedUsers([]); setCreateError(null); }}
                  className="btn-secondary flex-1 text-sm">
                  Cancel
                </button>
                <button
                  onClick={createConversation}
                  disabled={!selectedUsers.length || creating}
                  className="btn-primary flex-1 text-sm">
                  {creating
                    ? <><Spinner size={14} /> Creating...</>
                    : `Start Chat${selectedUsers.length > 0 ? ` (${selectedUsers.length})` : ''}`}
                </button>
              </div>
            </div>

          ) : activeConvId ? (
            <div className="flex flex-col h-full">
              <button onClick={() => setActiveConvId(null)} className="md:hidden flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-surface-300 hover:text-white border-b border-surface-700 shrink-0">
                <ArrowLeft size={16} /> Back to conversations
              </button>
              <div className="flex-1 min-h-0">
                <ChatPanel
                  conversationId={activeConvId}
                  currentProfile={profile}
                  onUnreadChange={loadConversations}
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
              <div className="w-16 h-16 rounded-2xl bg-brand-600/10 flex items-center justify-center">
                <MessageCircle size={28} className="text-brand-400" />
              </div>
              <p className="text-surface-200 font-medium">Select a conversation</p>
              <p className="text-sm text-surface-400">
                Choose from the list on the left, or start a new conversation
              </p>
              <button
                onClick={() => { setShowNewConv(true); setCreateError(null); loadAllUsers(); }}
                className="btn-primary text-sm flex items-center gap-1.5 mt-2">
                <Plus size={14} /> New Conversation
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}