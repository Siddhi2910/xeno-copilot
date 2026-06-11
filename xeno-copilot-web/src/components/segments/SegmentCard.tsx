'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RfmSegmentBadge } from '@/components/shared/RfmSegmentBadge';
import { SEGMENT_CHART_COLORS } from '@/lib/constants/segments';
import type { SegmentAggregate } from '@/lib/types/segment';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/utils/formatters';
import { cn } from '@/lib/utils/cn';

interface SegmentCardProps {
  segment: SegmentAggregate;
  active?: boolean;
  onSelect?: () => void;
}

export function SegmentCard({ segment, active, onSelect }: SegmentCardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border bg-white p-5 shadow-sm transition-shadow hover:shadow-md dark:bg-slate-900',
        active ? 'border-indigo-400 ring-2 ring-indigo-400/30' : 'border-slate-200 dark:border-slate-800',
      )}
      onClick={onSelect}
      role={onSelect ? 'button' : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onKeyDown={onSelect ? (e) => e.key === 'Enter' && onSelect() : undefined}
    >
      <div className="flex items-center gap-2">
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: SEGMENT_CHART_COLORS[segment.segment] }}
        />
        <RfmSegmentBadge segment={segment.segment} />
      </div>
      <div className="mt-4 space-y-1.5 text-sm text-slate-600 dark:text-slate-400">
        <p>
          <span className="font-semibold text-slate-900 dark:text-slate-100">{formatNumber(segment.count)}</span>{' '}
          customers ({formatPercent(segment.percentOfTotal)})
        </p>
        <p>Avg Spend: {formatCurrency(segment.avgSpend)}</p>
        <p>Avg Orders: {segment.avgOrderFrequency}</p>
        <p>Last Active: {segment.avgDaysSinceLastOrder} days avg</p>
      </div>
      <div className="mt-4">
        <Button asChild variant="outline" size="sm" className="w-full">
          <Link href={`/segments/${segment.segment}`}>
            Explore Customers
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
