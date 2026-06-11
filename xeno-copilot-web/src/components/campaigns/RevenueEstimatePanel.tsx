import type { RevenueEstimate } from '@/lib/types/campaign';
import { formatCurrency, formatPercent } from '@/lib/utils/formatters';

export function RevenueEstimatePanel({ estimate }: { estimate: RevenueEstimate }) {
  return (
    <div className="space-y-1">
      <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
        {formatCurrency(estimate.min)} – {formatCurrency(estimate.max)}
      </p>
      <p className="text-xs text-slate-500">
        est. {formatPercent(estimate.conversionRate * 100, 1)} CVR · {estimate.source.replace(/_/g, ' ')}
      </p>
    </div>
  );
}
