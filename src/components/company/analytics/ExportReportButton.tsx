'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { cn } from '@/utils/helpers';

type Format = 'excel' | 'pdf';

interface ExportReportButtonProps {
  startDate: string;
  endDate: string;
  className?: string;
}

export function ExportReportButton({ startDate, endDate, className }: ExportReportButtonProps) {
  const [loading, setLoading] = useState<Format | null>(null);

  async function handleExport(format: Format) {
    setLoading(format);
    try {
      const params = new URLSearchParams({ format, start: startDate, end: endDate });
      const res = await fetch(`/api/company/analytics/export?${params}`);
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const ext = format === 'excel' ? 'xlsx' : 'txt';
      const filename = `hiring-report.${ext}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className="text-sm text-surface-400">Export:</span>
      <button
        type="button"
        onClick={() => handleExport('excel')}
        disabled={!!loading}
        className="px-3 py-1.5 text-sm font-medium rounded-lg bg-surface-700 hover:bg-surface-600 text-white disabled:opacity-50 flex items-center gap-1.5"
      >
        {loading === 'excel' ? (
          <span className="w-4 h-4 border-2 border-surface-400 border-t-transparent rounded-full animate-spin" />
        ) : (
          <Download className="w-4 h-4" />
        )}
        Excel
      </button>
      <button
        type="button"
        onClick={() => handleExport('pdf')}
        disabled={!!loading}
        className="px-3 py-1.5 text-sm font-medium rounded-lg bg-surface-700 hover:bg-surface-600 text-white disabled:opacity-50 flex items-center gap-1.5"
      >
        {loading === 'pdf' ? (
          <span className="w-4 h-4 border-2 border-surface-400 border-t-transparent rounded-full animate-spin" />
        ) : (
          <Download className="w-4 h-4" />
        )}
        Report (TXT)
      </button>
    </div>
  );
}
