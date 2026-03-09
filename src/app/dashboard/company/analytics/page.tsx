'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, BarChart2 } from 'lucide-react';
import {
  DashboardMetricsGrid,
  HiringFunnelChart,
  TimeToHireChart,
  CostPerHireWidget,
  QualityOfHireScorecard,
  PipelineHealthGauge,
  PredictiveInsightsPanel,
  TeamPerformanceTable,
  DateRangePicker,
  ExportReportButton,
} from '@/components/company/analytics';
import type {
  DashboardMetrics,
  FunnelData,
  TimeToHireMetrics,
  CostPerHireBreakdown,
  DateRangePreset,
  TeamMemberPerf,
} from '@/components/company/analytics';
import type { PredictiveInsight } from '@/components/company/analytics';

function getDateRange(p: DateRangePreset): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date();
  if (p === '7d') start.setDate(start.getDate() - 7);
  else if (p === '30d') start.setDate(start.getDate() - 30);
  else start.setDate(start.getDate() - 90);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

export default function CompanyAnalyticsPage() {
  const [period, setPeriod] = useState<DateRangePreset>('30d');
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [funnel, setFunnel] = useState<FunnelData[]>([]);
  const [timeToHire, setTimeToHire] = useState<TimeToHireMetrics | null>(null);
  const [costPerHire, setCostPerHire] = useState<CostPerHireBreakdown | null>(null);
  const [quality, setQuality] = useState<{ average_score: number | null; total_evaluations: number }>({
    average_score: null,
    total_evaluations: 0,
  });
  const [predictive, setPredictive] = useState<PredictiveInsight | null>(null);
  const [team, setTeam] = useState<TeamMemberPerf[]>([]);
  const [loading, setLoading] = useState(true);

  const range = getDateRange(period);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const { startDate, endDate } = getDateRange(period);
    const params = new URLSearchParams({ period, start: startDate, end: endDate });
    Promise.all([
      fetch('/api/company/analytics/metrics').then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/company/analytics/funnel?${params}`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/company/analytics/time-to-hire?${params}`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/company/analytics/cost-per-hire?${params}`).then((r) => (r.ok ? r.json() : null)),
      fetch('/api/company/analytics/quality').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/company/analytics/predictive').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/company/analytics/team').then((r) => (r.ok ? r.json() : null)),
    ])
      .then(
        ([
          metricsRes,
          funnelRes,
          tthRes,
          cphRes,
          qualityRes,
          predictiveRes,
          teamRes,
        ]) => {
          if (cancelled) return;
          setMetrics(metricsRes ?? null);
          setFunnel(funnelRes?.funnel ?? []);
          setTimeToHire(tthRes ?? null);
          setCostPerHire(cphRes ?? null);
          setQuality({
            average_score: qualityRes?.average_score ?? null,
            total_evaluations: qualityRes?.total_evaluations ?? 0,
          });
          setPredictive(predictiveRes ?? null);
          setTeam(teamRes?.team ?? []);
        }
      )
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [period]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/company"
            className="p-2 rounded-lg bg-surface-800 hover:bg-surface-700 text-surface-400 hover:text-white transition-colors"
            aria-label="Back to dashboard"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-2">
            <BarChart2 className="w-8 h-8 text-brand-400" />
            <div>
              <h1 className="text-2xl font-bold text-white">Hiring Analytics</h1>
              <p className="text-surface-400 text-sm">Metrics, funnel, time-to-hire, cost &amp; predictions</p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <DateRangePicker value={period} onChange={setPeriod} />
          <ExportReportButton startDate={range.startDate} endDate={range.endDate} />
        </div>
      </div>

      <DashboardMetricsGrid metrics={metrics} loading={loading} />

      <div className="grid lg:grid-cols-2 gap-6">
        <HiringFunnelChart data={funnel} loading={loading} />
        <TimeToHireChart data={timeToHire} loading={loading} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <CostPerHireWidget data={costPerHire} loading={loading} />
        <div className="grid sm:grid-cols-2 gap-6">
          <QualityOfHireScorecard
            averageScore={quality.average_score}
            totalEvaluations={quality.total_evaluations}
            loading={loading}
          />
          <PipelineHealthGauge
            score={predictive?.pipeline_health ?? 0}
            loading={loading}
          />
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <PredictiveInsightsPanel data={predictive} loading={loading} />
        <TeamPerformanceTable team={team} loading={loading} />
      </div>

      <p className="text-surface-500 text-sm">
        Period: {range.startDate} – {range.endDate}. Export to Excel for full data. Add hiring costs and quality
        evaluations to improve cost-per-hire and quality metrics.
      </p>
    </div>
  );
}
