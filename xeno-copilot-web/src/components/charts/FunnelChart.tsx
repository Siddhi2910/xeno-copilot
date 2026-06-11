'use client';

import { formatNumber, formatPercent } from '@/lib/utils/formatters';
import { Skeleton } from '@/components/ui/skeleton';

interface FunnelChartProps {
  stats: { sent: number; delivered: number; opened: number; clicked: number; converted: number };
  rates: { deliveryRate: number; openRate: number; clickRate: number; conversionRate: number };
  isLoading?: boolean;
}

const STAGES = [
  { key: 'sent', label: 'Sent', rateKey: null },
  { key: 'delivered', label: 'Delivered', rateKey: 'deliveryRate' },
  { key: 'opened', label: 'Opened', rateKey: 'openRate' },
  { key: 'clicked', label: 'Clicked', rateKey: 'clickRate' },
  { key: 'converted', label: 'Converted', rateKey: 'conversionRate' },
] as const;

export function FunnelChart({ stats, rates, isLoading }: FunnelChartProps) {
  if (isLoading) return <Skeleton className="h-48 w-full" />;

  const max = Math.max(stats.sent, 1);

  return (
    <div className="space-y-3">
      {STAGES.map((stage, i) => {
        const value = stats[stage.key as keyof typeof stats];
        const width = Math.max((value / max) * 100, 4);
        const rate = stage.rateKey ? rates[stage.rateKey as keyof typeof rates] : null;
        return (
          <div key={stage.key}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-300">{stage.label}</span>
              <span className="tabular-nums text-slate-500">
                {formatNumber(value)}
                {rate != null ? ` · ${formatPercent(rate)}` : ''}
              </span>
            </div>
            <div className="h-6 overflow-hidden rounded bg-slate-100 dark:bg-slate-800">
              <div
                className="h-full rounded bg-gradient-to-r from-indigo-600 to-indigo-400 transition-all"
                style={{ width: `${width}%`, opacity: 1 - i * 0.12 }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
