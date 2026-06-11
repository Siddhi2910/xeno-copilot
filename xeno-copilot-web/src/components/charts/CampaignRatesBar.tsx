'use client';

import { Bar, BarChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { CampaignStats } from '@/lib/types/campaign';
import { Skeleton } from '@/components/ui/skeleton';

interface CampaignRatesBarProps {
  items: { name: string; stats: CampaignStats }[];
  isLoading?: boolean;
}

export function CampaignRatesBar({ items, isLoading }: CampaignRatesBarProps) {
  if (isLoading) return <Skeleton className="h-64 w-full" />;

  const data = items.map(({ name, stats }) => ({
    name: name.length > 16 ? `${name.slice(0, 16)}…` : name,
    delivery: stats.rates.deliveryRate,
    open: stats.rates.openRate,
    click: stats.rates.clickRate,
  }));

  if (!data.length) {
    return <p className="py-12 text-center text-sm text-slate-500">No campaign performance data.</p>;
  }

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <XAxis dataKey="name" tick={{ fontSize: 10 }} />
          <YAxis unit="%" />
          <Tooltip />
          <Legend />
          <Bar dataKey="delivery" name="Delivery" fill="#4f46e5" radius={[2, 2, 0, 0]} />
          <Bar dataKey="open" name="Open" fill="#10b981" radius={[2, 2, 0, 0]} />
          <Bar dataKey="click" name="Click" fill="#f59e0b" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
