/**
 * GET /api/company/analytics/export?format=excel|pdf&start=YYYY-MM-DD&end=YYYY-MM-DD
 * Export hiring report as Excel or PDF.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase-server';
import { getHiringFunnel, getTimeToHire, getCostPerHire, getDashboardMetrics, getPeriodRange } from '@/lib/company-analytics';
import * as XLSX from 'xlsx';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(req, {
    effectiveRoles: ['platform_admin', 'company_admin', 'recruiter'],
  });
  if (auth instanceof Response) return auth;

  const companyId = auth.profile.company_id;
  if (!companyId) {
    return NextResponse.json({ error: 'No company context' }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const format = searchParams.get('format') || 'excel';
  const start = searchParams.get('start');
  const end = searchParams.get('end');
  const range =
    start && end ? { startDate: start, endDate: end } : getPeriodRange('30d');

  const supabase = createServiceClient();
  const [metrics, funnel, timeToHire, costPerHire] = await Promise.all([
    getDashboardMetrics(supabase, companyId),
    getHiringFunnel(supabase, companyId, range),
    getTimeToHire(supabase, companyId, range),
    getCostPerHire(supabase, companyId, range.startDate, range.endDate),
  ]);

  if (format === 'pdf') {
    const pdfContent = buildPdfText(
      metrics as unknown as Record<string, unknown>,
      funnel,
      timeToHire,
      costPerHire,
      range
    );
    return new NextResponse(pdfContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': 'attachment; filename="hiring-report.txt"',
      },
    });
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ ...metrics, period: `${range.startDate} to ${range.endDate}` }]), 'Summary');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(funnel), 'Funnel');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(timeToHire.by_role), 'Time to Hire by Role');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(costPerHire.breakdown_by_type), 'Cost by Type');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="hiring-report.xlsx"',
    },
  });
}

function buildPdfText(
  metrics: Record<string, unknown>,
  funnel: { stage: string; count: number; percentage: number }[],
  timeToHire: { avg_days: number; by_role: { role: string; avg_days: number }[] },
  costPerHire: { cost_per_hire_cents: number; total_hires: number; breakdown_by_type: { type: string; amount_cents: number }[] },
  range: { startDate: string; endDate: string }
): string {
  const lines = [
    'Hiring Report',
    `Period: ${range.startDate} to ${range.endDate}`,
    '---',
    'Summary',
    `Active Jobs: ${metrics.total_active_jobs}`,
    `Applications: ${metrics.total_applications}`,
    `Screening: ${metrics.applications_in_screening}`,
    `Interview: ${metrics.applications_in_interview}`,
    `Offers: ${metrics.offers_made}`,
    `Hires: ${metrics.hires_completed}`,
    `Avg Time to Hire: ${metrics.avg_time_to_hire_days ?? '—'} days`,
    '---',
    'Funnel',
    ...funnel.map((s) => `${s.stage}: ${s.count} (${s.percentage.toFixed(1)}%)`),
    '---',
    'Time to Hire',
    `Average: ${timeToHire.avg_days.toFixed(0)} days`,
    ...timeToHire.by_role.map((r) => `  ${r.role}: ${r.avg_days.toFixed(0)} days`),
    '---',
    'Cost per Hire',
    `Total Hires: ${costPerHire.total_hires}`,
    `Cost per Hire: $${(costPerHire.cost_per_hire_cents / 100).toFixed(2)}`,
    ...costPerHire.breakdown_by_type.map((b) => `  ${b.type}: $${(b.amount_cents / 100).toFixed(2)}`),
  ];
  return lines.join('\n');
}
