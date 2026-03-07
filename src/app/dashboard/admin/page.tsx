'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase-browser';
import Link from 'next/link';
import {
  Building2, DollarSign, Activity, Briefcase, Users,
  TrendingUp, CheckCircle, Clock, Zap, AlertCircle,
} from 'lucide-react';

interface PlatformStats {
  companies: { total: number; active: number; trialing: number; past_due: number };
  revenue: { mrr: number; arr: number };
  jobs: { total: number; active: number };
  candidates: { total: number; active: number };
  system: { health: 'healthy' | 'degraded' | 'unhealthy'; last_ingestion: string; dbStatus?: string };
}

const PLAN_PRICING: Record<string, number> = { starter: 299, growth: 599, enterprise: 2499, unlimited: 4999 };

export default function PlatformAdminDashboard() {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    const [
      totalRes,
      activeRes,
      trialingRes,
      pastDueRes,
      paidCompaniesRes,
      jobsRes,
      jobsActiveRes,
      candidatesRes,
      cronRes,
    ] = await Promise.all([
      supabase.from('companies').select('*', { count: 'exact', head: true }),
      supabase.from('companies').select('*', { count: 'exact', head: true }).eq('is_active', true).eq('subscription_status', 'active'),
      supabase.from('companies').select('*', { count: 'exact', head: true }).eq('subscription_status', 'trialing'),
      supabase.from('companies').select('*', { count: 'exact', head: true }).eq('subscription_status', 'past_due'),
      supabase.from('companies').select('subscription_plan').eq('is_active', true).in('subscription_status', ['active', 'trialing']),
      supabase.from('jobs').select('*', { count: 'exact', head: true }),
      supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('candidates').select('*', { count: 'exact', head: true }),
      supabase.from('cron_run_history').select('started_at, status').or('mode.eq.cron_ingest,mode.eq.ingest').order('started_at', { ascending: false }).limit(1).maybeSingle(),
    ]);

    const mrr = (paidCompaniesRes.data || []).reduce(
      (sum, c) => sum + (PLAN_PRICING[c.subscription_plan] || 0),
      0
    );

    let health: 'healthy' | 'degraded' | 'unhealthy' = 'unhealthy';
    let dbStatus: string | undefined;
    try {
      const healthRes = await fetch('/api/health').then(r => r.json()).catch(() => ({}));
      health = healthRes.status === 'healthy' ? 'healthy' : healthRes.status === 'degraded' ? 'degraded' : 'unhealthy';
      dbStatus = healthRes.checks?.database;
    } catch {
      health = 'unhealthy';
    }

    const lastIngestion = cronRes.data?.started_at
      ? formatLastRun(cronRes.data.started_at)
      : 'N/A';

    setStats({
      companies: {
        total: totalRes.count ?? 0,
        active: activeRes.count ?? 0,
        trialing: trialingRes.count ?? 0,
        past_due: pastDueRes.count ?? 0,
      },
      revenue: { mrr, arr: mrr * 12 },
      jobs: { total: jobsRes.count ?? 0, active: jobsActiveRes.count ?? 0 },
      candidates: { total: candidatesRes.count ?? 0, active: candidatesRes.count ?? 0 },
      system: { health, last_ingestion: lastIngestion, dbStatus },
    });
    setLoading(false);
  }

  if (loading)
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full" />
      </div>
    );

  if (!stats) return null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Platform Dashboard</h1>
          <p className="text-surface-400 mt-1">Multi-tenant SaaS management</p>
        </div>
        <div className="flex items-center gap-3">
          <SystemHealthBadge status={stats.system.health} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Monthly Recurring Revenue"
          value={`$${stats.revenue.mrr.toLocaleString()}`}
          subtext={`$${stats.revenue.arr.toLocaleString()} ARR`}
          icon={<DollarSign className="w-5 h-5" />}
          gradient="from-emerald-500 to-teal-600"
          href="/dashboard/admin/companies?filter=active"
        />
        <MetricCard
          label="Active Companies"
          value={stats.companies.active}
          subtext={`${stats.companies.trialing} trialing`}
          icon={<Building2 className="w-5 h-5" />}
          gradient="from-violet-500 to-purple-600"
          href="/dashboard/admin/companies?filter=active"
        />
        <MetricCard
          label="Total Companies"
          value={stats.companies.total}
          subtext={stats.companies.past_due > 0 ? `${stats.companies.past_due} past due` : 'All healthy'}
          icon={<Building2 className="w-5 h-5" />}
          gradient="from-blue-500 to-indigo-600"
          href="/dashboard/admin/companies"
        />
        <MetricCard
          label="Platform Jobs"
          value={stats.jobs.total.toLocaleString()}
          subtext="Across all companies"
          icon={<Briefcase className="w-5 h-5" />}
          gradient="from-amber-500 to-orange-600"
          href="/dashboard/admin/jobs"
        />
      </div>

      <div className="bg-surface-800/50 border border-surface-700/60 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">System Health</h2>
          <Link
            href="/dashboard/admin/system/health"
            className="text-sm text-violet-400 hover:text-violet-300 transition-colors"
          >
            View Details →
          </Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <HealthCard
            label="Overall Status"
            status={stats.system.health}
            icon={<Activity className="w-5 h-5" />}
          />
          <HealthCard
            label="Database"
            status={(stats.system.dbStatus === 'healthy' ? 'healthy' : stats.system.dbStatus ? 'unhealthy' : 'healthy') as 'healthy' | 'unhealthy'}
            icon={<CheckCircle className="w-5 h-5" />}
          />
          <HealthCard
            label="Job Ingestion"
            status="healthy"
            icon={<Clock className="w-5 h-5" />}
            subtext={`Last run: ${stats.system.last_ingestion}`}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ActionCard
          title="Manage Connectors"
          description="Configure job board integrations"
          href="/dashboard/admin/system/connectors"
          icon={<Zap className="w-5 h-5" />}
        />
        <ActionCard
          title="View Companies"
          description="Manage customer companies"
          href="/dashboard/admin/companies"
          icon={<Building2 className="w-5 h-5" />}
        />
        <ActionCard
          title="Platform Analytics"
          description="Business metrics and trends"
          href="/dashboard/admin/reports"
          icon={<TrendingUp className="w-5 h-5" />}
        />
      </div>
    </div>
  );
}

function formatLastRun(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (mins > 0) return `${mins}m ago`;
  return 'Just now';
}

function MetricCard({ label, value, subtext, icon, gradient, href }: {
  label: string;
  value: number | string;
  subtext?: string;
  icon: React.ReactNode;
  gradient: string;
  href: string;
}) {
  return (
    <Link href={href} className="group">
      <div className={`relative overflow-hidden bg-gradient-to-br ${gradient} p-[1px] rounded-xl transition-all hover:scale-[1.02]`}>
        <div className="bg-surface-900 rounded-xl p-5 h-full">
          <div className="flex items-center justify-between mb-3">
            <div className={`bg-gradient-to-br ${gradient} bg-opacity-20 p-2 rounded-lg text-white`}>
              {icon}
            </div>
          </div>
          <div className="text-3xl font-bold text-white mb-1">{value}</div>
          <div className="text-sm font-medium text-surface-300">{label}</div>
          {subtext && <div className="text-xs text-surface-500 mt-1">{subtext}</div>}
        </div>
      </div>
    </Link>
  );
}

function SystemHealthBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    healthy: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    degraded: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    unhealthy: 'bg-red-500/10 text-red-400 border-red-500/20',
  };
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${colors[status] || 'bg-surface-500/10 text-surface-400 border-surface-500/20'}`}>
      <div className="w-2 h-2 rounded-full bg-current animate-pulse" />
      <span className="text-xs font-semibold uppercase">{status}</span>
    </div>
  );
}

function HealthCard({ label, status, icon, subtext }: {
  label: string;
  status: string;
  icon: React.ReactNode;
  subtext?: string;
}) {
  const statusColors: Record<string, string> = {
    healthy: 'text-emerald-400',
    degraded: 'text-amber-400',
    unhealthy: 'text-red-400',
  };
  return (
    <div className="flex items-center gap-3 bg-surface-900/50 rounded-lg p-4">
      <div className={statusColors[status] || 'text-surface-400'}>{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-white">{label}</div>
        <div className={`text-xs font-semibold uppercase ${statusColors[status] || 'text-surface-500'}`}>
          {status}
        </div>
        {subtext && <div className="text-xs text-surface-500 mt-0.5 truncate">{subtext}</div>}
      </div>
    </div>
  );
}

function ActionCard({ title, description, href, icon }: {
  title: string;
  description: string;
  href: string;
  icon: React.ReactNode;
}) {
  return (
    <Link href={href} className="group">
      <div className="bg-surface-800/50 border border-surface-700/60 rounded-xl p-5 hover:border-violet-500/50 transition-all">
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2 bg-violet-500/10 text-violet-400 rounded-lg">{icon}</div>
          <h3 className="text-lg font-semibold text-white">{title}</h3>
        </div>
        <p className="text-sm text-surface-400">{description}</p>
      </div>
    </Link>
  );
}
