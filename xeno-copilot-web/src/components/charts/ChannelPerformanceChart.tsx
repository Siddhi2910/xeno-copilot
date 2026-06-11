'use client';

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { SEGMENT_CHART_COLORS } from '@/lib/constants/segments';
import { Skeleton } from '@/components/ui/skeleton';

const COLORS: Record<string, string> = {
  WHATSAPP: '#22c55e',
  EMAIL: '#3b82f6',
  SMS: '#f97316',
  ONLINE: '#6366f1',
  OFFLINE: '#94a3b8',
};

interface ChannelPerformanceChartProps {
  channelMix: Record<string, number>;
  isLoading?: boolean;
}

export function ChannelPerformanceChart({ channelMix, isLoading }: ChannelPerformanceChartProps) {
  if (isLoading) return <Skeleton className="h-64 w-full" />;

  const data = Object.entries(channelMix)
    .map(([channel, count]) => ({ channel, count }))
    .sort((a, b) => b.count - a.count);

  if (!data.length) {
    return <p className="py-12 text-center text-sm text-slate-500">No channel data.</p>;
  }

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical">
          <XAxis type="number" />
          <YAxis type="category" dataKey="channel" width={80} tick={{ fontSize: 11 }} />
          <Tooltip />
          <Bar dataKey="count" radius={[0, 4, 4, 0]}>
            {data.map((entry) => (
              <Cell key={entry.channel} fill={COLORS[entry.channel] ?? SEGMENT_CHART_COLORS.GENERAL} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
