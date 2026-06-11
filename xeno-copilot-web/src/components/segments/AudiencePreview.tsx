'use client';

import { Clock } from 'lucide-react';
import { MetricCard } from '@/components/shared/MetricCard';
import { RfmSegmentBadge } from '@/components/shared/RfmSegmentBadge';
import { SkeletonCards } from '@/components/shared/SkeletonCards';
import type { SegmentsResponse } from '@/lib/types/segment';
import type { RfmSegment } from '@/lib/types/customer';
import { formatCurrency, formatDate, formatNumber, formatPercent } from '@/lib/utils/formatters';

interface AudiencePreviewProps {
  data?: SegmentsResponse;
  isLoading?: boolean;
  highlightSegment?: RfmSegment | null;
}

export function AudiencePreview({ data, isLoading, highlightSegment }: AudiencePreviewProps) {
  if (isLoading) return <SkeletonCards count={4} />;

  if (!data) return null;

  const top = [...data.segments].sort((a, b) => b.count - a.count)[0];
  const totalSegmented = data.segments.reduce((s, seg) => s + seg.count, 0);
  const highlighted = highlightSegment
    ? data.segments.find((s) => s.segment === highlightSegment)
    : top;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total Customers" value={formatNumber(data.totalCustomers)} variant="featured" />
        <MetricCard label="Segmented" value={formatNumber(totalSegmented)} />
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Largest Segment</p>
          <p className="mt-3 text-3xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
            {top ? formatNumber(top.count) : '—'}
          </p>
          {top ? <div className="mt-2"><RfmSegmentBadge segment={top.segment} /></div> : null}
        </div>
        <MetricCard
          label="Computed"
          value={formatDate(data.computedAt)}
          icon={Clock}
        />
      </div>

      {highlighted && highlighted.count > 0 ? (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-4 dark:border-indigo-900 dark:bg-indigo-950/30">
          <div className="flex flex-wrap items-center gap-2">
            <RfmSegmentBadge segment={highlighted.segment} />
            <span className="text-sm text-slate-600 dark:text-slate-400">
              {formatNumber(highlighted.count)} customers · {formatPercent(highlighted.percentOfTotal)} · avg{' '}
              {formatCurrency(highlighted.avgSpend)}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
