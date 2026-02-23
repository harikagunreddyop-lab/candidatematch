'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-browser';
import { Bell } from 'lucide-react';
import { cn, formatRelative } from '@/utils/helpers';

type AdminNotification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  data: any;
  read_by: string[] | null;
  created_at: string;
};

export function AdminNotificationBell({ adminId }: { adminId: string }) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AdminNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const unreadCount = useMemo(() => {
    return (items || []).filter(n => !(n.read_by || []).includes(adminId)).length;
  }, [items, adminId]);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('admin_notifications')
      .select('id,type,title,body,data,read_by,created_at')
      .order('created_at', { ascending: false })
      .limit(30);

    if (!error) setItems((data as any) || []);
    setLoading(false);
  };

  const markAllRead = async () => {
    // Mark read by appending adminId into read_by array (idempotent-ish on client side)
    const unread = items.filter(n => !(n.read_by || []).includes(adminId));
    if (!unread.length) return;

    // Update one-by-one (simple + reliable). Optimize later with RPC if needed.
    await Promise.all(
      unread.map(n =>
        supabase
          .from('admin_notifications')
          .update({ read_by: [...(n.read_by || []), adminId] })
          .eq('id', n.id)
      )
    );
    await load();
  };

  useEffect(() => {
    load();

    const channel = supabase
      .channel('admin-notifications')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'admin_notifications' },
        () => load()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="relative p-2 rounded-lg hover:bg-white/10 text-surface-400 hover:text-white transition-colors"
        aria-label="Admin notifications"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-[-1rem] sm:right-0 mt-2 w-[360px] max-w-[90vw] z-50 bg-surface-800 border border-surface-600 rounded-2xl shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-surface-700">
              <p className="text-sm font-semibold text-surface-100">Notifications</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={markAllRead}
                  className="text-xs px-2 py-1 rounded-lg hover:bg-surface-700 text-surface-400"
                >
                  Mark all read
                </button>
                <Link
                  href="/dashboard/admin/candidates"
                  className="text-xs px-2 py-1 rounded-lg hover:bg-surface-700 text-brand-400"
                  onClick={() => setOpen(false)}
                >
                  Open
                </Link>
              </div>
            </div>

            <div className="max-h-[420px] overflow-y-auto">
              {loading && (
                <div className="p-4 text-sm text-surface-500">Loading…</div>
              )}

              {!loading && items.length === 0 && (
                <div className="p-4 text-sm text-surface-500">No notifications.</div>
              )}

              {!loading &&
                items.map(n => {
                  const isUnread = !(n.read_by || []).includes(adminId);
                  return (
                    <div
                      key={n.id}
                      className={cn(
                        'px-4 py-3 border-b border-surface-700',
                        isUnread ? 'bg-brand-600/10' : 'bg-surface-800'
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className={cn('text-sm truncate', isUnread ? 'font-semibold text-surface-900' : 'font-medium text-surface-700')}>
                            {n.title}
                          </p>
                          {n.body && (
                            <p className="text-xs text-surface-600 mt-0.5 line-clamp-2">
                              {n.body}
                            </p>
                          )}
                          <p className="text-[10px] text-surface-400 mt-1">
                            {formatRelative(n.created_at)}
                          </p>
                        </div>

                        {isUnread && (
                          <span className="shrink-0 mt-1 w-2 h-2 rounded-full bg-red-500" />
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}