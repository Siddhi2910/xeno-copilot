'use client';

import Link from 'next/link';
import { RfmSegmentBadge } from '@/components/shared/RfmSegmentBadge';
import { SkeletonTable } from '@/components/shared/SkeletonTable';
import type { SegmentAggregate } from '@/lib/types/segment';
import type { RfmSegment } from '@/lib/types/customer';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/utils/formatters';
import { cn } from '@/lib/utils/cn';

interface SegmentStatsTableProps {
  segments: SegmentAggregate[];
  isLoading?: boolean;
  activeSegment?: RfmSegment | null;
  onSegmentClick?: (segment: RfmSegment) => void;
}

export function SegmentStatsTable({
  segments,
  isLoading,
  activeSegment,
  onSegmentClick,
}: SegmentStatsTableProps) {
  if (isLoading) return <SkeletonTable columns={6} rows={6} />;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 dark:border-slate-800">
            {['Segment', 'Customers', '% of Total', 'Avg Spend', 'Avg Orders', 'Avg Days Dormant'].map((h) => (
              <th key={h} className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {segments.map((s) => (
            <tr
              key={s.segment}
              className={cn(
                'border-b border-slate-100 transition-colors hover:bg-indigo-50/40 dark:border-slate-800/50 dark:hover:bg-indigo-950/20',
                activeSegment === s.segment && 'bg-indigo-50/60 dark:bg-indigo-950/30',
              )}
            >
              <td className="px-3 py-2">
                {onSegmentClick ? (
                  <button type="button" onClick={() => onSegmentClick(s.segment)} className="text-left">
                    <RfmSegmentBadge segment={s.segment} />
                  </button>
                ) : (
                  <Link href={`/segments/${s.segment}`}>
                    <RfmSegmentBadge segment={s.segment} />
                  </Link>
                )}
              </td>
              <td className="px-3 py-2 tabular-nums">{formatNumber(s.count)}</td>
              <td className="px-3 py-2 tabular-nums">{formatPercent(s.percentOfTotal)}</td>
              <td className="px-3 py-2 tabular-nums">{formatCurrency(s.avgSpend)}</td>
              <td className="px-3 py-2 tabular-nums">{s.avgOrderFrequency}</td>
              <td className="px-3 py-2 tabular-nums">{s.avgDaysSinceLastOrder}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
