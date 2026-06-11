'use client';

import { useMemo, useState } from 'react';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button } from '@/components/ui/button';
import { SEGMENT_CHART_COLORS, RFM_SEGMENTS } from '@/lib/constants/segments';
import type { SegmentAggregate } from '@/lib/types/segment';
import type { RfmSegment } from '@/lib/types/customer';
import { formatCurrency, formatNumber } from '@/lib/utils/formatters';
import { Skeleton } from '@/components/ui/skeleton';

type MetricKey = 'avgSpend' | 'avgOrderFrequency' | 'count';

interface SegmentBarChartProps {
  segments: SegmentAggregate[];
  isLoading?: boolean;
  activeSegment?: RfmSegment | null;
}

const METRICS: { key: MetricKey; label: string }[] = [
  { key: 'avgSpend', label: 'Avg Spend' },
  { key: 'avgOrderFrequency', label: 'Avg Orders' },
  { key: 'count', label: 'Count' },
];

export function SegmentBarChart({ segments, isLoading, activeSegment }: SegmentBarChartProps) {
  const [metric, setMetric] = useState<MetricKey>('avgSpend');

  const data = useMemo(
    () =>
      [...segments]
        .sort((a, b) => b[metric] - a[metric])
        .map((s) => ({
          segment: s.segment,
          label: RFM_SEGMENTS.find((r) => r.value === s.segment)?.label ?? s.segment,
          value: s[metric],
          fill: SEGMENT_CHART_COLORS[s.segment],
          opacity: activeSegment && activeSegment !== s.segment ? 0.35 : 1,
        })),
    [segments, metric, activeSegment],
  );

  if (isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  const formatValue = (v: number) => (metric === 'avgSpend' ? formatCurrency(v) : formatNumber(v));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {METRICS.map((m) => (
          <Button
            key={m.key}
            type="button"
            size="sm"
            variant={metric === m.key ? 'default' : 'outline'}
            onClick={() => setMetric(m.key)}
          >
            {m.label}
          </Button>
        ))}
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
            <XAxis type="number" tickFormatter={(v) => (metric === 'avgSpend' ? `₹${(v / 1000).toFixed(0)}k` : String(v))} />
            <YAxis type="category" dataKey="label" width={120} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v) => formatValue(Number(v ?? 0))} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
              {data.map((entry) => (
                <Cell key={entry.segment} fill={entry.fill} fillOpacity={entry.opacity} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
