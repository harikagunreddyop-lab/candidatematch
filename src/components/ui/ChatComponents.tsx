'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { cn, formatRelative } from '@/utils/helpers';
import { Send, Paperclip, X, Download, File, Check, CheckCheck } from 'lucide-react';
import { Spinner } from '@/components/ui';
import type { Profile } from '@/types';

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string | null;
  attachment_path: string | null;
  attachment_name: string | null;
  attachment_type: string | null;
  created_at: string;
  sender?: Profile;
};

export type Conversation = {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  participants?: ConversationParticipant[];
  last_message?: Message;
  unread_count?: number;
};

export type ConversationParticipant = {
  conversation_id: string;
  profile_id: string;
  last_read_at: string | null;
  profile?: Profile;
};

// ─── Online dot ─────────────────────────────────────────────────────────────
export function OnlineDot({ profileId }: { profileId: string }) {
  const [online, setOnline] = useState(false);
  const supabase = createClient();
  useEffect(() => {
    supabase.from('user_presence').select('is_online,last_seen_at').eq('profile_id', profileId).single()
      .then(({ data }) => {
        if (!data) return;
        const lastSeen = new Date(data.last_seen_at).getTime();
        setOnline(data.is_online && Date.now() - lastSeen < 60_000);
      });
  }, [profileId]);
  return (
    <span className={cn('inline-block w-2 h-2 rounded-full', online ? 'bg-green-400' : 'bg-surface-300')} />
  );
}

// ─── Conversation List Item ───────────────────────────────────────────────────
export function ConversationItem({
  conv, active, onClick, currentProfileId,
}: {
  conv: Conversation; active: boolean; onClick: () => void; currentProfileId: string;
}) {
  const others = conv.participants?.filter(p => p.profile_id !== currentProfileId) || [];
  const getDisplayName = (p: ConversationParticipant) => {
    const name = p.profile?.name?.trim();
    return name || p.profile?.email || 'Unknown User';
  };
  const title = conv.title || others.map(getDisplayName).join(', ');
  const unread = conv.unread_count || 0;

  return (
    <button onClick={onClick} className={cn(
      'w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-50',
      active && 'bg-brand-600/10 hover:bg-brand-600/10'
    )}>
      {/* Avatar stack */}
      <div className="relative shrink-0 w-9 h-9">
        {others.slice(0, 2).map((p, i) => (
          <div key={p.profile_id} className={cn(
            'absolute w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 border-surface-800',
            i === 0 ? 'top-0 left-0 bg-brand-600/20 text-brand-300 z-10' : 'bottom-0 right-0 bg-purple-600/20 text-purple-300'
          )}>
            {(p.profile?.name?.trim() || p.profile?.email || '?')[0].toUpperCase()}
          </div>
        ))}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className={cn('text-sm truncate', unread > 0 ? 'font-semibold text-surface-900' : 'font-medium text-surface-700')}>{title}</p>
          <span className="text-[10px] text-surface-400 shrink-0">{formatRelative(conv.updated_at)}</span>
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <p className="text-xs text-surface-500 truncate">
            {conv.last_message?.content || (conv.last_message?.attachment_name ? `📎 ${conv.last_message.attachment_name}` : 'No messages yet')}
          </p>
          {unread > 0 && (
            <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-brand-600 text-white text-[10px] font-bold flex items-center justify-center">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// ─── Message Bubble ───────────────────────────────────────────────────────────
function MessageBubble({ msg, isMine }: { msg: Message; isMine: boolean }) {
  const supabase = createClient();
  const downloadAttachment = async () => {
    if (!msg.attachment_path) return;
    const { data } = await supabase.storage.from('chat-attachments').createSignedUrl(msg.attachment_path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  };

  return (
    <div className={cn('flex gap-2 items-end max-w-[75%]', isMine ? 'ml-auto flex-row-reverse' : '')}>
      {!isMine && (
        <div className="w-6 h-6 rounded-full bg-surface-700 flex items-center justify-center text-[10px] font-bold text-surface-300 shrink-0 mb-1">
          {(msg.sender?.name?.trim() || msg.sender?.email || '?')[0].toUpperCase()}
        </div>
      )}
      <div>
        {!isMine && (
          <p className="text-[10px] text-surface-400 mb-1 ml-1">{msg.sender?.name?.trim() || msg.sender?.email}</p>
        )}
        <div className={cn(
          'rounded-2xl px-3 py-2 text-sm',
          isMine ? 'bg-brand-600 text-white rounded-br-sm' : 'bg-surface-700 text-surface-200 rounded-bl-sm'
        )}>
          {msg.content && <p className="leading-relaxed whitespace-pre-wrap break-words">{msg.content}</p>}
          {msg.attachment_path && (
            <button onClick={downloadAttachment}
              className={cn('flex items-center gap-2 mt-1 text-xs rounded-lg px-2 py-1.5 transition-colors',
                isMine ? 'bg-brand-500 hover:bg-brand-400 text-white' : 'bg-surface-600 hover:bg-surface-500 text-surface-200')}>
              <File size={12} />
              <span className="truncate max-w-[120px] sm:max-w-[160px]">{msg.attachment_name || 'Attachment'}</span>
              <Download size={12} className="shrink-0" />
            </button>
          )}
        </div>
        <p className={cn('text-[10px] text-surface-400 mt-1', isMine ? 'text-right mr-1' : 'ml-1')}>
          {new Date(msg.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  );
}

// ─── Main Chat Panel ──────────────────────────────────────────────────────────
export function ChatPanel({
  conversationId,
  currentProfile,
  onUnreadChange,
}: {
  conversationId: string;
  currentProfile: Profile;
  onUnreadChange?: () => void;
}) {
  const supabase = createClient();
  const [messages, setMessages] = useState<Message[]>([]);
  const [participants, setParticipants] = useState<ConversationParticipant[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadMessages = useCallback(async () => {
    const [msgRes, partRes] = await Promise.all([
      supabase.from('messages')
        .select('*, sender:profiles!sender_id(id, name, email, role)')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true }),
      supabase.from('conversation_participants')
        .select('*, profile:profiles!profile_id(id, name, email, role)')
        .eq('conversation_id', conversationId),
    ]);
    setMessages(msgRes.data || []);
    setParticipants(partRes.data || []);
    setLoading(false);
    // Mark as read
    await supabase.from('conversation_participants')
      .update({ last_read_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .eq('profile_id', currentProfile.id);
    onUnreadChange?.();
  }, [conversationId, currentProfile.id]);

  useEffect(() => {
    loadMessages();
    // Realtime subscription
    const channel = supabase
      .channel(`messages-${conversationId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, () => loadMessages())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [conversationId, loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Update presence
  useEffect(() => {
    const updatePresence = async () => {
      await supabase.from('user_presence').upsert({
        profile_id: currentProfile.id, is_online: true, last_seen_at: new Date().toISOString(),
      });
    };
    updatePresence();
    const interval = setInterval(updatePresence, 30_000);
    return () => {
      clearInterval(interval);
      supabase.from('user_presence').upsert({
        profile_id: currentProfile.id, is_online: false, last_seen_at: new Date().toISOString(),
      });
    };
  }, [currentProfile.id]);

  const sendMessage = async (content: string, attachmentPath?: string, attachmentName?: string, attachmentType?: string) => {
    if (!content.trim() && !attachmentPath) return;
    setSending(true);
    await supabase.from('messages').insert({
      conversation_id: conversationId,
      sender_id: currentProfile.id,
      content: content.trim() || null,
      attachment_path: attachmentPath || null,
      attachment_name: attachmentName || null,
      attachment_type: attachmentType || null,
    });
    setText('');
    setSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(text); }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const path = `${conversationId}/${currentProfile.id}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from('chat-attachments').upload(path, file);
    if (!error) await sendMessage('', path, file.name, file.type);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const others = participants.filter(p => p.profile_id !== currentProfile.id);

  if (loading) return <div className="flex items-center justify-center h-full"><Spinner size={24} /></div>;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-surface-700 flex items-center gap-3 shrink-0">
        {others.map(p => (
          <div key={p.profile_id} className="flex items-center gap-2">
            <div className="relative">
              <div className="w-8 h-8 rounded-full bg-brand-600/20 flex items-center justify-center text-brand-300 font-bold text-sm">
                {(p.profile?.name?.trim() || p.profile?.email || '?')[0].toUpperCase()}
              </div>
              <div className="absolute -bottom-0.5 -right-0.5">
                <OnlineDot profileId={p.profile_id} />
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-surface-800">{p.profile?.name?.trim() || p.profile?.email}</p>
              <p className="text-[10px] text-surface-400 capitalize">{p.profile?.role}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-2 sm:p-4 space-y-3">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-surface-400">No messages yet. Say hello!</p>
          </div>
        )}
        {messages.map(msg => (
          <MessageBubble key={msg.id} msg={msg} isMine={msg.sender_id === currentProfile.id} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-surface-700 shrink-0">
        <div className="flex items-end gap-2">
          <div className="flex-1 flex items-end gap-2 bg-surface-800 rounded-2xl px-3 py-2 border border-surface-600 focus-within:border-brand-400 transition-colors">
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message... (Enter to send)"
              rows={1}
              className="flex-1 bg-transparent outline-none text-sm text-surface-200 placeholder-surface-500 resize-none max-h-32"
            />
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              className="text-surface-400 hover:text-brand-600 transition-colors shrink-0 pb-0.5">
              {uploading ? <Spinner size={16} /> : <Paperclip size={16} />}
            </button>
          </div>
          <button
            onClick={() => sendMessage(text)}
            disabled={sending || (!text.trim())}
            className="w-9 h-9 rounded-full bg-brand-600 hover:bg-brand-700 disabled:opacity-40 flex items-center justify-center text-white transition-colors shrink-0">
            {sending ? <Spinner size={14} className="text-white" /> : <Send size={15} />}
          </button>
        </div>
        <input ref={fileRef} type="file" className="hidden" onChange={handleFileUpload}
          accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.txt" />
        <p className="text-[10px] text-surface-400 mt-1.5 ml-1">PDF, DOC, images accepted</p>
      </div>
    </div>
  );
}