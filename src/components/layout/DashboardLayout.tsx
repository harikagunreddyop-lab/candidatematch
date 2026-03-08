'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { createClient, subscribeWithLog } from '@/lib/supabase-browser';
import type { DashboardProfile } from '@/types';
import {
  LayoutDashboard, Users, Briefcase, LogOut,
  ChevronLeft, ChevronRight, Cpu, UserCircle, ClipboardList,
  Zap, Menu, Link2, Plug, MessageCircle,
  BarChart3, Settings, FileText, Shield, Building2,
  Activity, Clock, GitBranch, CreditCard, Sparkles, FileSearch,
  Calendar, Target, ChevronDown, Mic, DollarSign, MessageSquare,
  Search, Bell,
} from 'lucide-react';
import { AdminNotificationBell } from '@/components/ui/AdminNotifications';
import { ThemeToggle } from '@/components/ThemeToggle';
import { DashboardContent } from '@/components/layout/DashboardContent';
import { cn } from '@/utils/helpers';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  badge?: number;
  children?: { label: string; href: string; icon?: React.ReactNode }[];
}

// B2B SaaS: Dashboard, Companies, System, Analytics, Settings; Jobs/Candidates for platform-wide view
const adminNav: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard/admin', icon: <LayoutDashboard size={18} /> },
  { label: 'Companies', href: '/dashboard/admin/companies', icon: <Building2 size={18} /> },
  { label: 'Candidates', href: '/dashboard/admin/candidates', icon: <Users size={18} /> },
  { label: 'Jobs', href: '/dashboard/admin/jobs', icon: <Briefcase size={18} /> },
  { label: 'Applications', href: '/dashboard/admin/applications', icon: <ClipboardList size={18} /> },
  { label: 'Users', href: '/dashboard/admin/users', icon: <UserCircle size={18} /> },
  { label: 'Health', href: '/dashboard/admin/system/health', icon: <Activity size={18} /> },
  { label: 'Connectors', href: '/dashboard/admin/system/connectors', icon: <Link2 size={18} /> },
  { label: 'Cron', href: '/dashboard/admin/system/cron', icon: <Clock size={18} /> },
  { label: 'Automation', href: '/dashboard/admin/system/automation', icon: <Zap size={18} /> },
  { label: 'Analytics', href: '/dashboard/admin/reports', icon: <BarChart3 size={18} /> },
  { label: 'Audit log', href: '/dashboard/admin/audit', icon: <FileText size={18} /> },
  { label: 'Messages', href: '/dashboard/admin/messages', icon: <MessageCircle size={18} /> },
  { label: 'Compliance', href: '/dashboard/admin/compliance', icon: <Shield size={18} /> },
  { label: 'Settings', href: '/dashboard/admin/settings', icon: <Settings size={18} /> },
];

// Blueprint: Dashboard, Jobs, Candidates, Pipeline, Team, Analytics, Messages, Settings, Billing
const companyAdminNav: NavItem[] = [
  { label: 'Dashboard',   href: '/dashboard/company',                  icon: <LayoutDashboard size={18} /> },
  { label: 'Jobs',        href: '/dashboard/company/jobs',             icon: <Briefcase size={18} /> },
  { label: 'Candidates',  href: '/dashboard/company/candidates',      icon: <Users size={18} /> },
  { label: 'Pipeline',    href: '/dashboard/company/pipeline',        icon: <GitBranch size={18} /> },
  { label: 'Team',        href: '/dashboard/company/team',             icon: <Users size={18} /> },
  { label: 'Analytics',   href: '/dashboard/company/analytics',       icon: <BarChart3 size={18} /> },
  { label: 'Success Fees', href: '/dashboard/company/success-fees',   icon: <DollarSign size={18} /> },
  { label: 'Messages',    href: '/dashboard/company/messages',        icon: <MessageCircle size={18} /> },
  { label: 'Settings',    href: '/dashboard/company/settings',        icon: <Settings size={18} /> },
  { label: 'Billing',     href: '/dashboard/company/settings/billing', icon: <CreditCard size={18} /> },
];

// Blueprint: Dashboard, Jobs, Candidates, Applications, Pipeline, Reports, Integrations, Messages
const recruiterNav: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard/recruiter', icon: <LayoutDashboard size={18} /> },
  { label: 'Jobs', href: '/dashboard/recruiter/jobs', icon: <Briefcase size={18} /> },
  { label: 'Candidates', href: '/dashboard/recruiter/candidates', icon: <Users size={18} /> },
  { label: 'Sourcing', href: '/dashboard/recruiter/sourcing', icon: <Search size={18} /> },
  { label: 'Applications', href: '/dashboard/recruiter/applications', icon: <ClipboardList size={18} /> },
  { label: 'Pipeline', href: '/dashboard/recruiter/pipeline', icon: <GitBranch size={18} /> },
  { label: 'Reports', href: '/dashboard/recruiter/reports', icon: <BarChart3 size={18} /> },
  { label: 'Integrations', href: '/dashboard/recruiter/integrations', icon: <Plug size={18} /> },
  { label: 'Messages', href: '/dashboard/recruiter/messages', icon: <MessageCircle size={18} /> },
];

// B2B SaaS: Candidate nav with dropdowns for Tools, Career, Integrations
const candidateNav: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard/candidate', icon: <LayoutDashboard size={18} /> },
  { label: 'Matches', href: '/dashboard/candidate/matches', icon: <Sparkles size={18} /> },
  { label: 'Jobs', href: '/dashboard/candidate/jobs', icon: <Briefcase size={18} /> },
  { label: 'Job Alerts', href: '/dashboard/candidate/alerts', icon: <Bell size={18} /> },
  { label: 'Applications', href: '/dashboard/candidate/applications', icon: <ClipboardList size={18} /> },
  { label: 'Profile', href: '/dashboard/candidate/profile', icon: <UserCircle size={18} /> },
  { label: 'Resume', href: '/dashboard/candidate/profile/resume', icon: <FileText size={18} /> },
  { label: 'Interviews', href: '/dashboard/candidate/interviews', icon: <Calendar size={18} /> },
  {
    label: 'Tools',
    href: '/dashboard/candidate/tools/ats-checker',
    icon: <FileSearch size={18} />,
    children: [
      { label: 'ATS Checker', href: '/dashboard/candidate/tools/ats-checker', icon: <FileSearch size={16} /> },
      { label: 'Interview Prep', href: '/dashboard/candidate/interview-prep', icon: <Mic size={16} /> },
      { label: 'Salary Intel', href: '/dashboard/candidate/salary', icon: <DollarSign size={16} /> },
      { label: 'Career Coach', href: '/dashboard/candidate/coach', icon: <MessageSquare size={16} /> },
    ],
  },
  {
    label: 'Career',
    href: '/dashboard/candidate/career-path',
    icon: <Target size={18} />,
    children: [
      { label: 'Career Path', href: '/dashboard/candidate/career-path' },
      { label: 'Skill Gaps', href: '/dashboard/candidate/skills/gap-analysis' },
      { label: 'Network', href: '/dashboard/candidate/network' },
    ],
  },
  {
    label: 'Integrations',
    href: '/dashboard/candidate/integrations',
    icon: <Plug size={18} />,
    children: [
      { label: 'Gmail', href: '/dashboard/candidate/integrations' },
      { label: 'Extension', href: '/dashboard/candidate/connect-extension' },
      { label: 'ATS Connect', href: '/dashboard/candidate/integrations' },
    ],
  },
  { label: 'Messages', href: '/dashboard/candidate/messages', icon: <MessageCircle size={18} /> },
  { label: 'Settings', href: '/dashboard/candidate/settings', icon: <Settings size={18} /> },
];

export default function DashboardLayout({ children, profile }: { children: React.ReactNode; profile: DashboardProfile }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [client, setClient] = useState<ReturnType<typeof createClient> | null>(null);
  const [expandedNav, setExpandedNav] = useState<string | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    setClient(createClient());
  }, []);

  const effectiveRole = profile.effective_role;
  const baseNavItems =
    (effectiveRole === 'platform_admin') ? adminNav :
    effectiveRole === 'company_admin'  ? companyAdminNav :
    effectiveRole === 'recruiter'      ? recruiterNav :
    candidateNav;

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
    if (href === '/dashboard/admin' || href === '/dashboard/company' || href === '/dashboard/recruiter' || href === '/dashboard/candidate') {
      return pathname === href;
    }
    return pathname.startsWith(href);
  };

  // Auto-expand candidate nav dropdown when on a child route
  useEffect(() => {
    if (effectiveRole !== 'candidate') return;
    for (const item of candidateNav) {
      if (item.children?.some(c => pathname.startsWith(c.href))) {
        setExpandedNav(item.label);
        break;
      }
    }
  }, [pathname, effectiveRole]);

  const effectiveRoleForNav = (profile as { effective_role?: string }).effective_role || profile.role;
  const dashboardHref =
    (effectiveRoleForNav === 'platform_admin' || effectiveRoleForNav === 'admin') ? '/dashboard/admin' :
    effectiveRoleForNav === 'company_admin' ? '/dashboard/company' :
    effectiveRoleForNav === 'recruiter' ? '/dashboard/recruiter' : '/dashboard/candidate';
  const messagesHref =
    (effectiveRoleForNav === 'platform_admin' || effectiveRoleForNav === 'admin') ? '/dashboard/admin/messages' :
    effectiveRoleForNav === 'company_admin' ? '/dashboard/company/messages' :
    effectiveRoleForNav === 'recruiter' ? '/dashboard/recruiter/messages' : '/dashboard/candidate/messages';

  const role = profile.role as 'candidate' | 'recruiter' | 'admin';

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
              <span className="font-semibold text-surface-800 dark:text-white font-display tracking-tight text-[15px]">
                Orion CMOS
              </span>
            )}
          </Link>
        </div>

        {/* Nav - role-specific active state design */}
        <nav className="flex-1 py-5 px-3 space-y-1 overflow-y-auto scrollbar-none">
          {navItems.map(item => {
            const hasChildren = item.children && item.children.length > 0;
            const isExpanded = expandedNav === item.label;
            const isParentActive = hasChildren && item.children!.some(c => pathname.startsWith(c.href));
            const active = isParentActive || (!hasChildren && (item.href === '/dashboard/admin' || item.href === '/dashboard/company' || item.href === '/dashboard/recruiter' || item.href === '/dashboard/candidate' ? pathname === item.href : pathname.startsWith(item.href)));

            if (hasChildren) {
              return (
                <div key={item.href + item.label}>
                  <button
                    type="button"
                    onClick={() => setExpandedNav(isExpanded ? null : item.label)}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 w-full text-left',
                      'relative',
                      (active || isExpanded) ? 'text-surface-900 dark:text-white' : 'text-surface-600 dark:text-neutral-400 hover:text-surface-900 dark:hover:text-neutral-200',
                      !active && !isExpanded && 'hover:bg-[var(--role-sidebar-nav-hover-bg)]',
                      collapsed && 'justify-center px-0'
                    )}
                    style={{
                      backgroundColor: active || isExpanded ? 'var(--role-sidebar-nav-active-bg)' : undefined,
                      ...(active && role === 'candidate' && { border: '1px solid var(--role-sidebar-nav-active-border)' }),
                    }}
                  >
                    <span className={cn('relative shrink-0', (active || isExpanded) ? 'opacity-100' : 'opacity-70')} style={{ color: (active || isExpanded) ? 'var(--role-accent)' : undefined }}>
                      {item.icon}
                    </span>
                    {!collapsed && (
                      <>
                        <span className="truncate flex-1">{item.label}</span>
                        <ChevronDown size={14} className={cn('shrink-0 transition-transform', isExpanded && 'rotate-180')} />
                      </>
                    )}
                  </button>
                  {!collapsed && isExpanded && item.children && (
                    <div className="pl-4 mt-0.5 space-y-0.5 border-l-2 border-surface-600 ml-4">
                      {item.children.map(child => {
                        const childActive = pathname.startsWith(child.href);
                        return (
                          <Link
                            key={child.href + child.label}
                            href={child.href}
                            onClick={() => setMobileOpen(false)}
                            className={cn(
                              'flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors',
                              childActive ? 'text-surface-900 dark:text-white bg-[var(--role-sidebar-nav-active-bg)]' : 'text-surface-600 dark:text-neutral-400 hover:text-surface-900 dark:hover:text-neutral-200 hover:bg-[var(--role-sidebar-nav-hover-bg)]'
                            )}
                          >
                            {child.icon && <span className="shrink-0 opacity-70" style={{ color: childActive ? 'var(--role-accent)' : undefined }}>{child.icon}</span>}
                            <span className="truncate">{child.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            const linkActive = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => { setMobileOpen(false); setExpandedNav(null); }}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
                  'relative',
                  linkActive ? 'text-surface-900 dark:text-white' : 'text-surface-600 dark:text-neutral-400 hover:text-surface-900 dark:hover:text-neutral-200',
                  !linkActive && 'hover:bg-[var(--role-sidebar-nav-hover-bg)]',
                  collapsed && 'justify-center px-0'
                )}
                style={{
                  backgroundColor: linkActive ? 'var(--role-sidebar-nav-active-bg)' : undefined,
                  borderLeft: linkActive && role !== 'candidate' ? '3px solid var(--role-accent)' : undefined,
                  marginLeft: linkActive && role !== 'candidate' ? '-3px' : undefined,
                  paddingLeft: linkActive && role !== 'candidate' ? 'calc(0.75rem - 3px)' : undefined,
                  ...(linkActive && role === 'candidate' && { border: '1px solid var(--role-sidebar-nav-active-border)' }),
                }}
              >
                <span
                  className={cn('relative shrink-0', linkActive ? 'opacity-100' : 'opacity-70')}
                  style={{ color: linkActive ? 'var(--role-accent)' : undefined }}
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
              'text-surface-600 dark:text-neutral-500 hover:text-surface-900 dark:hover:text-neutral-200 hover:bg-[var(--role-sidebar-nav-hover-bg)]',
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
              'text-surface-600 dark:text-neutral-400 hover:text-surface-900 dark:hover:text-neutral-400 hover:bg-[var(--role-sidebar-nav-hover-bg)]',
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
            className="lg:hidden p-2.5 rounded-xl text-surface-600 dark:text-neutral-400 hover:text-surface-900 dark:hover:text-white transition-colors duration-200"
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
          <div />
          <div className="flex items-center gap-2 sm:gap-4">
            <ThemeToggle />
            {effectiveRole === 'platform_admin' && <AdminNotificationBell adminId={profile.id} />}
            <Link
              href={messagesHref}
              className="relative p-2.5 rounded-xl text-surface-600 dark:text-neutral-400 hover:text-surface-900 dark:hover:text-white transition-colors duration-200"
            >
              <MessageCircle size={20} />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-semibold flex items-center justify-center">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </Link>
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium text-surface-900 dark:text-white truncate max-w-[140px]">{profile.name || profile.email}</p>
              <p className="text-xs capitalize" style={{ color: 'var(--role-accent)' }}>{effectiveRole?.replace('_', ' ') || profile.role}</p>
            </div>
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center font-semibold text-sm text-surface-800 dark:text-white border"
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
          <DashboardContent>{children}</DashboardContent>
        </main>
      </div>
    </div>
  );
}
