import { MetricCard } from '@/components/shared/MetricCard';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/utils/formatters';

interface ExecutiveSummaryProps {
  totalCustomers: number;
  activeCampaigns: number;
  completedCampaigns: number;
  drafts: number;
  revenue: number;
  orderCount: number;
  avgConversion?: number;
}

export function ExecutiveSummary({
  totalCustomers,
  activeCampaigns,
  completedCampaigns,
  drafts,
  revenue,
  orderCount,
  avgConversion,
}: ExecutiveSummaryProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Total Customers" value={formatNumber(totalCustomers)} />
      <MetricCard label="Active Campaigns" value={formatNumber(activeCampaigns)} variant="featured" />
      <MetricCard label="Completed Campaigns" value={formatNumber(completedCampaigns)} />
      <MetricCard label="Drafts in Progress" value={formatNumber(drafts)} />
      <MetricCard label="Revenue (Period)" value={formatCurrency(revenue)} />
      <MetricCard
        label="Orders (Period)"
        value={formatNumber(orderCount)}
        delta={avgConversion != null ? `${formatPercent(avgConversion)} avg CVR` : undefined}
      />
    </div>
  );
}
