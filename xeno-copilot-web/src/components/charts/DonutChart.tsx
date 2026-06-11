'use client';

import { useRouter } from 'next/navigation';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { SEGMENT_CHART_COLORS } from '@/lib/constants/segments';
import { RFM_SEGMENTS } from '@/lib/constants/segments';
import type { SegmentAggregate } from '@/lib/types/segment';
import type { RfmSegment } from '@/lib/types/customer';
import { formatNumber } from '@/lib/utils/formatters';
import { Skeleton } from '@/components/ui/skeleton';

interface DonutChartProps {
  segments: SegmentAggregate[];
  totalCustomers: number;
  isLoading?: boolean;
  activeSegment?: RfmSegment | null;
}

export function DonutChart({ segments, totalCustomers, isLoading, activeSegment }: DonutChartProps) {
  const router = useRouter();

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Skeleton className="h-48 w-48 rounded-full" />
      </div>
    );
  }

  const data = segments
    .filter((s) => s.count > 0)
    .map((s) => ({
      name: RFM_SEGMENTS.find((r) => r.value === s.segment)?.label ?? s.segment,
      value: s.count,
      segment: s.segment,
    }));

  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-slate-500">
        No segment data
      </div>
    );
  }

  return (
    <div className="relative h-64">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={90}
            paddingAngle={2}
            dataKey="value"
            onClick={(_, i) => router.push(`/segments/${data[i].segment}`)}
            className="cursor-pointer"
          >
            {data.map((entry) => (
              <Cell
                key={entry.segment}
                fill={SEGMENT_CHART_COLORS[entry.segment as RfmSegment]}
                opacity={activeSegment && activeSegment !== entry.segment ? 0.35 : 1}
                strokeWidth={activeSegment === entry.segment ? 2 : 0}
                stroke={activeSegment === entry.segment ? '#4f46e5' : undefined}
              />
            ))}
          </Pie>
          <Tooltip formatter={(v) => formatNumber(Number(v ?? 0))} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
          {formatNumber(totalCustomers)}
        </span>
        <span className="text-xs text-slate-500">total customers</span>
      </div>
    </div>
  );
}
