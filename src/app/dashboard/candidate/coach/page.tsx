'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, MessageCircle } from 'lucide-react';
import { cn } from '@/utils/helpers';

type Message = { role: 'user' | 'assistant'; content: string };

export default function CareerCoachPage() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Hi! I\'m your career coach. Ask me about job search strategy, resume tips, negotiation, or interview prep.' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', content: text }]);
    setLoading(true);
    try {
      const res = await fetch('/api/coach/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: messages.slice(-6) }),
      });
      const data = await res.json();
      const reply = data.reply || 'I couldn\'t generate a response. Try again.';
      setMessages((m) => [...m, { role: 'assistant', content: reply }]);
    } catch {
      setMessages((m) => [...m, { role: 'assistant', content: 'Something went wrong. Please try again.' }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto flex flex-col h-[calc(100vh-8rem)]">
      <div className="mb-3 rounded-2xl border border-surface-300 bg-surface-100 px-4 py-3">
        <h1 className="text-xl font-bold text-surface-900">Career coach</h1>
        <p className="text-xs text-surface-600 mt-1">Ask focused questions and get practical next steps for your search.</p>
      </div>
      <div className="flex-1 rounded-2xl border border-surface-300 bg-surface-100 flex flex-col overflow-hidden shadow-sm">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={cn(
                'flex gap-3',
                msg.role === 'user' ? 'justify-end' : 'justify-start'
              )}
            >
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-brand-500/15 border border-brand-300 flex items-center justify-center shrink-0">
                  <MessageCircle className="w-4 h-4 text-brand-600" />
                </div>
              )}
              <div
                className={cn(
                  'max-w-[85%] rounded-xl px-4 py-2.5 text-sm',
                  msg.role === 'user'
                    ? 'bg-brand-400 text-[#0a0f00]'
                    : 'bg-surface-50 border border-surface-300 text-surface-800'
                )}
              >
                {msg.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-brand-500/15 border border-brand-300 flex items-center justify-center shrink-0">
                <MessageCircle className="w-4 h-4 text-brand-600" />
              </div>
              <div className="rounded-xl px-4 py-2.5 bg-surface-50 border border-surface-300 text-surface-600">Thinking…</div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
        <form onSubmit={handleSubmit} className="p-4 border-t border-surface-300 bg-surface-50">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything about your career..."
              className="input flex-1"
              disabled={loading}
            />
            <button type="submit" disabled={loading || !input.trim()} className="btn-primary px-4 h-10 rounded-xl">
              <Send size={18} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
