'use client';

import Link from 'next/link';
import { ArrowLeft, Users } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/layout/PageHeader';
import { RfmSegmentBadge } from '@/components/shared/RfmSegmentBadge';
import { ChannelBadge } from '@/components/shared/ChannelBadge';
import { TimestampCell } from '@/components/shared/TimestampCell';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { SkeletonCards } from '@/components/shared/SkeletonCards';
import { Button } from '@/components/ui/button';
import { getCustomer } from '@/lib/api/customers';
import { listOrders } from '@/lib/api/orders';
import { formatCurrency, formatNumber, formatDate } from '@/lib/utils/formatters';

export default function CustomerDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;

  const { data: customerRes, isLoading, isError, refetch } = useQuery({
    queryKey: ['customers', 'detail', id],
    queryFn: () => getCustomer(id),
  });

  const { data: ordersRes, isLoading: ordersLoading } = useQuery({
    queryKey: ['orders', 'list', { customerId: id }],
    queryFn: () => listOrders({ customerId: id, limit: 20 }),
    enabled: !!customerRes,
  });

  if (isLoading) return <SkeletonCards count={3} />;
  if (isError) return <ErrorState heading="Failed to load customer" onRetry={() => refetch()} />;
  if (!customerRes?.data) {
    return (
      <EmptyState
        icon={Users}
        heading="Customer not found"
        description="This customer may have been removed."
        action={{ label: 'Back to customers', href: '/customers' }}
      />
    );
  }

  const c = customerRes.data;
  const orders = ordersRes?.data ?? [];

  return (
    <div className="space-y-8">
      <PageHeader
        title={c.name}
        subtitle={c.phone}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/customers"><ArrowLeft className="h-4 w-4" /> Back</Link>
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-4 font-medium text-slate-900 dark:text-slate-100">Profile</h2>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Phone</dt>
              <dd>{c.phone}</dd>
            </div>
            {c.email && (
              <div className="flex justify-between">
                <dt className="text-slate-500">Email</dt>
                <dd>{c.email}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-slate-500">RFM Segment</dt>
              <dd><RfmSegmentBadge segment={c.rfmSegment} /></dd>
            </div>
            {c.rfmR != null && (
              <div className="flex justify-between">
                <dt className="text-slate-500">R/F/M Scores</dt>
                <dd className="tabular-nums">{c.rfmR}/{c.rfmF}/{c.rfmM}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-slate-500">Total Orders</dt>
              <dd>{formatNumber(c.totalOrders)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Total Spend</dt>
              <dd>{formatCurrency(c.totalSpend)}</dd>
            </div>
            {c.lastOrderAt && (
              <div className="flex justify-between">
                <dt className="text-slate-500">Last Order</dt>
                <dd>{formatDate(c.lastOrderAt)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-slate-500">Source</dt>
              <dd>{c.source}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Customer Since</dt>
              <dd>{formatDate(c.createdAt)}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-4 font-medium text-slate-900 dark:text-slate-100">Opt-Out Channels</h2>
          {c.optOutChannels.length ? (
            <div className="flex flex-wrap gap-2">
              {c.optOutChannels.map((ch) => <ChannelBadge key={ch} channel={ch} />)}
            </div>
          ) : (
            <p className="text-sm text-slate-500">No opt-outs.</p>
          )}
          {c.tags.length > 0 && (
            <>
              <h2 className="mb-3 mt-6 font-medium text-slate-900 dark:text-slate-100">Tags</h2>
              <div className="flex flex-wrap gap-2">
                {c.tags.map((t) => (
                  <span key={t} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300">{t}</span>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-4 font-medium text-slate-900 dark:text-slate-100">Recent Orders</h2>
        {ordersLoading ? (
          <p className="text-sm text-slate-500">Loading orders…</p>
        ) : orders.length === 0 ? (
          <p className="text-sm text-slate-500">No orders found.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-medium uppercase text-slate-400 dark:border-slate-800">
                <th className="pb-2 pr-4">Order ID</th>
                <th className="pb-2 pr-4">Amount</th>
                <th className="pb-2 pr-4">Channel</th>
                <th className="pb-2">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
              {orders.map((o) => (
                <tr key={o._id}>
                  <td className="py-2 pr-4 font-mono text-xs">{o.orderId}</td>
                  <td className="py-2 pr-4">{formatCurrency(o.amount)}</td>
                  <td className="py-2 pr-4"><ChannelBadge channel={o.channel} /></td>
                  <td className="py-2"><TimestampCell iso={o.orderDate} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
