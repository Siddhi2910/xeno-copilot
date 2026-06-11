'use client';

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatCurrency } from '@/lib/utils/formatters';
import { Skeleton } from '@/components/ui/skeleton';
import type { Order } from '@/lib/types/order';

interface RevenueTrendChartProps {
  orders: Order[];
  isLoading?: boolean;
}

export function RevenueTrendChart({ orders, isLoading }: RevenueTrendChartProps) {
  if (isLoading) return <Skeleton className="h-64 w-full" />;

  const byDay = new Map<string, number>();
  for (const o of orders) {
    const day = o.orderDate.slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + o.amount);
  }
  const data = Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, revenue]) => ({ date, revenue }));

  if (!data.length) {
    return <p className="py-12 text-center text-sm text-slate-500">No orders in selected range.</p>;
  }

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} />
          <YAxis tickFormatter={(v) => `₹${(Number(v) / 1000).toFixed(0)}k`} />
          <Tooltip formatter={(v) => formatCurrency(Number(v ?? 0))} />
          <Bar dataKey="revenue" fill="#4f46e5" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
