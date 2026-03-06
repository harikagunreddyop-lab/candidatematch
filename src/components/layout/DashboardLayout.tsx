'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { createClient, subscribeWithLog } from '@/lib/supabase-browser';
import { cn } from '@/utils/helpers';
import type { Profile } from '@/types';
import {
  LayoutDashboard, Users, Briefcase, LogOut,
  ChevronLeft, ChevronRight, Cpu, UserCircle, ClipboardList,
  Zap, Menu, Link2, Plug, MessageCircle,
  BarChart3, Settings, Calendar, FileText, Shield,
} from 'lucide-react';
import { AdminNotificationBell } from '@/components/ui/AdminNotifications';
import { ThemeToggle } from '@/components/ThemeToggle';

interface NavItem { label: string; href: string; icon: React.ReactNode; badge?: number; }

const adminNav: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard/admin', icon: <LayoutDashboard size={18} /> },
  { label: 'Candidates', href: '/dashboard/admin/candidates', icon: <Users size={18} /> },
  { label: 'Applications', href: '/dashboard/admin/applications', icon: <ClipboardList size={18} /> },
  { label: 'Pipeline', href: '/dashboard/admin/pipeline', icon: <Cpu size={18} /> },
  { label: 'Jobs', href: '/dashboard/admin/jobs', icon: <Briefcase size={18} /> },
  { label: 'Assignments', href: '/dashboard/admin/assignments', icon: <Link2 size={18} /> },
  { label: 'Users', href: '/dashboard/admin/users', icon: <UserCircle size={18} /> },
  { label: 'Reports', href: '/dashboard/admin/reports', icon: <BarChart3 size={18} /> },
  { label: 'Audit log', href: '/dashboard/admin/audit', icon: <FileText size={18} /> },
  { label: 'Interviews', href: '/dashboard/admin/interviews', icon: <Calendar size={18} /> },
  { label: 'Messages', href: '/dashboard/admin/messages', icon: <MessageCircle size={18} /> },
  { label: 'Compliance', href: '/dashboard/admin/compliance', icon: <Shield size={18} /> },
  { label: 'Settings', href: '/dashboard/admin/settings', icon: <Settings size={18} /> },
];

const recruiterNav: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard/recruiter', icon: <LayoutDashboard size={18} /> },
  { label: 'Job search', href: '/dashboard/recruiter/jobs', icon: <Briefcase size={18} /> },
  { label: 'Candidates', href: '/dashboard/recruiter/candidates', icon: <Users size={18} /> },
  { label: 'Applications', href: '/dashboard/recruiter/applications', icon: <ClipboardList size={18} /> },
  { label: 'Pipeline', href: '/dashboard/recruiter/pipeline', icon: <Cpu size={18} /> },
  { label: 'Talent report', href: '/dashboard/recruiter/reports', icon: <BarChart3 size={18} /> },
  { label: 'Integrations', href: '/dashboard/recruiter/integrations', icon: <Plug size={18} /> },
  { label: 'Messages', href: '/dashboard/recruiter/messages', icon: <MessageCircle size={18} /> },
];

const candidateNav: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard/candidate', icon: <LayoutDashboard size={18} /> },
  { label: 'Job search', href: '/dashboard/candidate/jobs', icon: <Briefcase size={18} /> },
  { label: 'Skill report', href: '/dashboard/candidate/skill-report', icon: <BarChart3 size={18} /> },
  { label: 'Interviews', href: '/dashboard/candidate/interviews', icon: <Calendar size={18} /> },
  { label: 'My profile', href: '/dashboard/candidate/profile', icon: <UserCircle size={18} /> },
  { label: 'Settings', href: '/dashboard/candidate/settings', icon: <Settings size={18} /> },
  { label: 'Messages', href: '/dashboard/candidate/messages', icon: <MessageCircle size={18} /> },
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversation_participants' }, () => loadUnreadCount());
    subscribeWithLog(channel, 'layout-unread');
    return () => { client.removeChannel(channel); };
  }, [client, loadUnreadCount]);

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
      /* noop */
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

  const role = profile.role as 'candidate' | 'recruiter' | 'admin';
  const dashboardHref = role === 'admin' ? '/dashboard/admin' : role === 'recruiter' ? '/dashboard/recruiter' : '/dashboard/candidate';
  const messagesHref = role === 'admin' ? '/dashboard/admin/messages' : role === 'recruiter' ? '/dashboard/recruiter/messages' : '/dashboard/candidate/messages';

  return (
    <div className="min-h-screen flex" data-role={role} style={{ backgroundColor: 'var(--role-main-bg)' }}>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden" onClick={() => setMobileOpen(false)} aria-hidden="true" />
      )}

      {/* Sidebar - role-specific design via CSS variables */}
      <aside
        className={cn(
          'fixed lg:sticky top-0 left-0 h-screen flex flex-col z-50 transition-all duration-300 ease-out',
          collapsed ? 'w-[72px]' : 'w-[256px]',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
        style={{
          backgroundColor: 'var(--role-sidebar-bg)',
          borderRight: '1px solid var(--role-sidebar-border)',
        }}
      >
        {/* Role accent line - left edge */}
        <div
          className="absolute top-0 left-0 w-[3px] h-full pointer-events-none"
          style={{ background: 'var(--role-sidebar-accent-line)' }}
        />

        {/* Logo area */}
        <div className={cn(
          'relative flex items-center h-[64px] px-4 border-b shrink-0',
          collapsed && 'justify-center px-0'
        )}
          style={{ borderColor: 'var(--role-sidebar-border)' }}
        >
          <Link href={dashboardHref} className="flex items-center gap-3 group">
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border transition-all duration-200"
              style={{
                backgroundColor: 'var(--role-sidebar-logo-bg)',
                borderColor: 'var(--role-sidebar-logo-border)',
              }}
            >
              <Image src="/logo.png" alt="Orion CMOS" width={26} height={26} className="object-contain opacity-90" />
            </div>
            {!collapsed && (
              <span className="font-semibold text-white font-display tracking-tight text-[15px]">
                Orion CMOS
              </span>
            )}
          </Link>
        </div>

        {/* Nav - role-specific active state design */}
        <nav className="flex-1 py-5 px-3 space-y-1 overflow-y-auto scrollbar-none">
          {navItems.map(item => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
                  'relative',
                  active ? 'text-white' : 'text-neutral-400 hover:text-neutral-200',
                  !active && 'hover:bg-[var(--role-sidebar-nav-hover-bg)]',
                  collapsed && 'justify-center px-0'
                )}
                style={{
                  backgroundColor: active ? 'var(--role-sidebar-nav-active-bg)' : undefined,
                  borderLeft: active && role !== 'candidate' ? '3px solid var(--role-accent)' : undefined,
                  marginLeft: active && role !== 'candidate' ? '-3px' : undefined,
                  paddingLeft: active && role !== 'candidate' ? 'calc(0.75rem - 3px)' : undefined,
                  ...(active && role === 'candidate' && {
                    border: '1px solid var(--role-sidebar-nav-active-border)',
                  }),
                }}
              >
                <span
                  className={cn('relative shrink-0', active ? 'opacity-100' : 'opacity-70')}
                  style={{ color: active ? 'var(--role-accent)' : undefined }}
                >
                  {item.icon}
                  {collapsed && item.badge && item.badge > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[14px] h-3.5 px-0.5 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center">
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  )}
                </span>
                {!collapsed && <span className="truncate flex-1">{item.label}</span>}
                {!collapsed && item.badge && item.badge > 0 && (
                  <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500/90 text-white text-[10px] font-semibold flex items-center justify-center shrink-0">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Bottom */}
        <div
          className="border-t p-3 space-y-1 shrink-0"
          style={{ borderColor: 'var(--role-sidebar-border)' }}
        >
          <button
            onClick={handleSignOut}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium w-full transition-all duration-200',
              'text-neutral-500 hover:text-neutral-200 hover:bg-[var(--role-sidebar-nav-hover-bg)]',
              collapsed && 'justify-center px-0'
            )}
          >
            <LogOut size={18} />
            {!collapsed && 'Sign Out'}
          </button>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className={cn(
              'hidden lg:flex items-center gap-3 px-3 py-2 rounded-xl text-sm w-full transition-all duration-200',
              'text-neutral-600 hover:text-neutral-400 hover:bg-[var(--role-sidebar-nav-hover-bg)]',
              collapsed && 'justify-center px-0'
            )}
          >
            {collapsed ? <ChevronRight size={18} /> : <><ChevronLeft size={18} /> Collapse</>}
          </button>
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0 relative overflow-hidden">
        {/* Role-tinted ambient glow */}
        <div
          className="absolute top-0 left-0 right-0 h-[240px] pointer-events-none"
          style={{ background: 'var(--role-main-glow)' }}
        />

        {/* Header */}
        <header
          className="sticky top-0 z-30 h-14 sm:h-16 flex items-center justify-between px-4 sm:px-6 lg:px-8 backdrop-blur-xl border-b"
          style={{
            backgroundColor: 'var(--role-header-bg)',
            borderColor: 'var(--role-header-border)',
          }}
        >
          <button
            onClick={() => setMobileOpen(true)}
            className="lg:hidden p-2.5 rounded-xl text-neutral-400 hover:text-white transition-colors duration-200"
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
          <div />
          <div className="flex items-center gap-2 sm:gap-4">
            <ThemeToggle />
            {profile.role === 'admin' && <AdminNotificationBell adminId={profile.id} />}
            <Link
              href={messagesHref}
              className="relative p-2.5 rounded-xl text-neutral-400 hover:text-white transition-colors duration-200"
            >
              <MessageCircle size={20} />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-semibold flex items-center justify-center">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </Link>
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium text-white truncate max-w-[140px]">{profile.name || profile.email}</p>
              <p className="text-xs capitalize" style={{ color: 'var(--role-accent)' }}>{profile.role}</p>
            </div>
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center font-semibold text-sm text-white border"
              style={{
                backgroundColor: 'var(--role-sidebar-logo-bg)',
                borderColor: 'var(--role-sidebar-logo-border)',
              }}
            >
              {(profile.name || profile.email || '?')[0].toUpperCase()}
            </div>
          </div>
        </header>

        <main className="relative flex-1 p-4 sm:p-5 lg:p-8 overflow-x-hidden min-w-0 w-full">
          {children}
        </main>
      </div>
    </div>
  );
}
