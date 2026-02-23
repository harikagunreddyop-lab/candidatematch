'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import { cn } from '@/utils/helpers';
import type { Profile } from '@/types';
import {
  LayoutDashboard, Users, Briefcase, LogOut,
  ChevronLeft, ChevronRight, Cpu, UserCircle, ClipboardList,
  Zap, Menu, X, Link2, MessageCircle,
  BarChart3, Settings, Calendar, FileText,
} from 'lucide-react';
import { AdminNotificationBell } from '@/components/ui/AdminNotifications';

interface NavItem { label: string; href: string; icon: React.ReactNode; badge?: number; }

const adminNav: NavItem[] = [
  { label: 'Dashboard',    href: '/dashboard/admin',              icon: <LayoutDashboard size={18} /> },
  { label: 'Candidates',  href: '/dashboard/admin/candidates',  icon: <Users size={18} /> },
  { label: 'Applications', href: '/dashboard/admin/applications', icon: <ClipboardList size={18} /> },
  { label: 'Pipeline',    href: '/dashboard/admin/pipeline',      icon: <Cpu size={18} /> },
  { label: 'Jobs',        href: '/dashboard/admin/jobs',         icon: <Briefcase size={18} /> },
  { label: 'Assignments', href: '/dashboard/admin/assignments',  icon: <Link2 size={18} /> },
  { label: 'Scraping',    href: '/dashboard/admin/scraping',     icon: <Zap size={18} /> },
  { label: 'Users',       href: '/dashboard/admin/users',        icon: <UserCircle size={18} /> },
  { label: 'Reports',     href: '/dashboard/admin/reports',      icon: <BarChart3 size={18} /> },
  { label: 'Audit log',   href: '/dashboard/admin/audit',        icon: <FileText size={18} /> },
  { label: 'Interviews',  href: '/dashboard/admin/interviews',   icon: <Calendar size={18} /> },
  { label: 'Messages',    href: '/dashboard/admin/messages',     icon: <MessageCircle size={18} /> },
  { label: 'Settings',    href: '/dashboard/admin/settings',     icon: <Settings size={18} /> },
];

const recruiterNav: NavItem[] = [
  { label: 'Dashboard',    href: '/dashboard/recruiter',              icon: <LayoutDashboard size={18} /> },
  { label: 'Candidates',   href: '/dashboard/recruiter/candidates',   icon: <Users size={18} /> },
  { label: 'Applications', href: '/dashboard/recruiter/applications', icon: <ClipboardList size={18} /> },
  { label: 'Pipeline',     href: '/dashboard/recruiter/pipeline',     icon: <Cpu size={18} /> },
  { label: 'Talent report', href: '/dashboard/recruiter/reports',     icon: <BarChart3 size={18} /> },
  { label: 'Messages',     href: '/dashboard/recruiter/messages',     icon: <MessageCircle size={18} /> },
];

const candidateNav: NavItem[] = [
  { label: 'Dashboard',       href: '/dashboard/candidate',              icon: <LayoutDashboard size={18} /> },
  { label: 'Skill report',    href: '/dashboard/candidate/skill-report', icon: <BarChart3 size={18} /> },
  { label: 'Interviews',      href: '/dashboard/candidate/interviews',  icon: <Calendar size={18} /> },
  { label: 'My profile',      href: '/dashboard/candidate/profile',     icon: <UserCircle size={18} /> },
  { label: 'Settings',       href: '/dashboard/candidate/settings',    icon: <Settings size={18} /> },
  { label: 'Messages',       href: '/dashboard/candidate/messages',     icon: <MessageCircle size={18} /> },
];

export default function DashboardLayout({ children, profile }: { children: React.ReactNode; profile: Profile }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [client, setClient] = useState<ReturnType<typeof createClient> | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    setClient(createClient());
  }, []);

  const baseNavItems = profile.role === 'admin' ? adminNav : profile.role === 'recruiter' ? recruiterNav : candidateNav;

  const loadUnreadCount = useCallback(async () => {
    if (!client) return;
    const { data: partRows } = await client
      .from('conversation_participants').select('conversation_id').eq('profile_id', profile.id);
    if (!partRows?.length) { setUnreadCount(0); return; }

    const convIds = partRows.map(r => r.conversation_id);
    const [msgRes, unreadRes] = await Promise.all([
      client.from('messages').select('id, conversation_id, sender_id, created_at')
        .in('conversation_id', convIds),
      client.from('conversation_participants')
        .select('conversation_id, last_read_at').eq('profile_id', profile.id).in('conversation_id', convIds),
    ]);

    const myReadMap: Record<string, string | null> = {};
    for (const r of (unreadRes.data || [])) myReadMap[r.conversation_id] = r.last_read_at;

    let total = 0;
    for (const convId of convIds) {
      const lastRead = myReadMap[convId];
      const msgs = (msgRes.data || []).filter(m => m.conversation_id === convId && m.sender_id !== profile.id);
      total += lastRead
        ? msgs.filter(m => new Date(m.created_at) > new Date(lastRead)).length
        : msgs.length;
    }
    setUnreadCount(total);
  }, [client, profile.id]);

  useEffect(() => {
    if (!client) return;
    loadUnreadCount();
    const channel = client.channel('layout-unread')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => loadUnreadCount())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversation_participants' }, () => loadUnreadCount())
      .subscribe();
    return () => { client.removeChannel(channel); };
  }, [client, loadUnreadCount]);

  // Inject unread badge into Messages nav item
  const navItems: NavItem[] = baseNavItems.map(item =>
    item.label === 'Messages' ? { ...item, badge: unreadCount } : item
  );

  const handleSignOut = async () => {
    const c = client ?? createClient();
    try {
      await c.from('user_presence').upsert({
        profile_id: profile.id, is_online: false, last_seen_at: new Date().toISOString(),
      });
    } catch {
      // Don't block sign out if presence update fails (RLS, network, etc.)
    }
    await c.auth.signOut();
    window.location.href = '/';
  };

  const isActive = (href: string) => {
    if (href === '/dashboard/admin' || href === '/dashboard/recruiter' || href === '/dashboard/candidate') {
      return pathname === href;
    }
    return pathname.startsWith(href);
  };

  return (
    <div className="min-h-screen bg-surface-50 dark:bg-surface-900 flex">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/30 z-40 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar — glossy black */}
      <aside className={cn(
        'fixed lg:sticky top-0 left-0 h-screen flex flex-col z-50 transition-all duration-300',
        'bg-gradient-to-b from-neutral-900 via-black to-black border-r border-white/10 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]',
        collapsed ? 'w-[68px]' : 'w-[240px]',
        mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      )}>
        {/* Logo */}
        <div className={cn('flex items-center h-16 border-b border-white/10 px-4', collapsed && 'justify-center')}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-lg">
              <Cpu size={16} className="text-white" />
            </div>
            {!collapsed && <span className="font-bold text-white font-display tracking-tight">Orion CMOS</span>}
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {navItems.map(item => (
            <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all relative',
                isActive(item.href)
                  ? 'bg-white/10 text-white shadow-inner'
                  : 'text-neutral-400 hover:bg-white/5 hover:text-white',
                collapsed && 'justify-center px-0'
              )}>
              <span className={cn('relative', isActive(item.href) ? 'text-brand-400' : 'text-neutral-500')}>
                {item.icon}
                {collapsed && item.badge && item.badge > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-0.5 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
              </span>
              {!collapsed && item.label}
              {!collapsed && item.badge && item.badge > 0 && (
                <span className="ml-auto min-w-[20px] h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {item.badge > 99 ? '99+' : item.badge}
                </span>
              )}
            </Link>
          ))}
        </nav>

        {/* Bottom */}
        <div className="border-t border-white/10 p-3 space-y-1">
          <button onClick={handleSignOut}
            className={cn('flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-neutral-400 hover:bg-white/5 hover:text-white w-full transition-all', collapsed && 'justify-center px-0')}>
            <LogOut size={18} />
            {!collapsed && 'Sign Out'}
          </button>
          <button onClick={() => setCollapsed(!collapsed)}
            className={cn('hidden lg:flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-neutral-500 hover:bg-white/5 hover:text-neutral-300 w-full transition-all', collapsed && 'justify-center px-0')}>
            {collapsed ? <ChevronRight size={18} /> : <><ChevronLeft size={18} /> Collapse</>}
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar — glossy black */}
        <header className="sticky top-0 z-30 h-16 flex items-center justify-between px-4 lg:px-8 bg-black/90 backdrop-blur-xl border-b border-white/10 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]">
          <button onClick={() => setMobileOpen(true)} className="lg:hidden p-2 rounded-lg hover:bg-white/10 text-neutral-400 hover:text-white">
            <Menu size={20} />
          </button>
          <div />
          <div className="flex items-center gap-3">
            {profile.role === 'admin' && (
              <AdminNotificationBell adminId={profile.id} />
            )}
            <Link href={
              profile.role === 'admin' ? '/dashboard/admin/messages'
              : profile.role === 'recruiter' ? '/dashboard/recruiter/messages'
              : '/dashboard/candidate/messages'
            } className="relative p-2 rounded-lg hover:bg-white/10 text-neutral-400 hover:text-white transition-colors">
              <MessageCircle size={20} />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </Link>
            <div className="text-right">
              <p className="text-sm font-medium text-white">{profile.name || profile.email}</p>
              <p className="text-xs text-neutral-400 capitalize">{profile.role}</p>
            </div>
            <div className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center text-white font-bold text-sm border border-white/20">
              {(profile.name || profile.email || '?')[0].toUpperCase()}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}