'use client';

import { Suspense, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ShoppingBag } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { MetricCard } from '@/components/shared/MetricCard';
import { DataTable } from '@/components/tables/DataTable';
import { FilterBar } from '@/components/forms/FilterBar';
import { DateRangePicker } from '@/components/forms/DateRangePicker';
import { CursorPagination } from '@/components/shared/CursorPagination';
import { EmptyState } from '@/components/shared/EmptyState';
import { orderColumns } from '@/components/orders/columns';
import { useOrders } from '@/lib/hooks/useOrders';
import { ORDER_CHANNELS } from '@/lib/constants/channels';
import { formatCurrency } from '@/lib/utils/formatters';
import type { OrderChannel } from '@/lib/types/order';

function OrdersContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const channel = (searchParams.get('channel') ?? '') as OrderChannel | '';
  const startDate = searchParams.get('startDate') ?? '';
  const endDate = searchParams.get('endDate') ?? '';
  const customerId = searchParams.get('customerId') ?? '';

  const filters = useMemo(
    () => ({
      channel: channel || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      customerId: customerId || undefined,
    }),
    [channel, startDate, endDate, customerId],
  );

  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage, isError } = useOrders(filters);

  const rows = useMemo(() => data?.pages.flatMap((p) => p.data) ?? [], [data]);
  const total = data?.pages[0]?.pagination.total;

  const stats = useMemo(() => {
    const revenue = rows.reduce((s, o) => s + o.amount, 0);
    const count = rows.length;
    const aov = count > 0 ? revenue / count : 0;
    return { count, revenue, aov };
  }, [rows]);

  const setParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) params.set(key, value);
      else params.delete(key);
      router.replace(`/orders?${params.toString()}`);
    },
    [router, searchParams],
  );

  const activeCount = [channel, startDate, endDate, customerId].filter(Boolean).length;
  const clearFilters = () => router.replace('/orders');

  return (
    <div className="space-y-6">
      <PageHeader title="Orders" subtitle="Browse order history and attribution" />

      {!isLoading && rows.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <MetricCard label="Orders Shown" value={stats.count} />
          <MetricCard label="Revenue Shown" value={formatCurrency(stats.revenue)} />
          <MetricCard label="Avg Order Value" value={formatCurrency(stats.aov)} />
        </div>
      ) : null}

      <DataTable
        columns={orderColumns}
        data={rows}
        isLoading={isLoading}
        emptyState={
          isError ? (
            <EmptyState icon={ShoppingBag} heading="Failed to load orders" description="Check your connection and try again." />
          ) : (
            <EmptyState
              icon={ShoppingBag}
              heading="No orders found"
              description={activeCount ? 'Try adjusting your filters.' : 'Orders will appear after import.'}
              action={activeCount ? { label: 'Clear filters', onClick: clearFilters } : undefined}
            />
          )
        }
        filterBar={
          <FilterBar activeCount={activeCount} onClear={activeCount ? clearFilters : undefined}>
            <select
              value={channel}
              onChange={(e) => setParam('channel', e.target.value)}
              className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="">All Channels</option>
              {ORDER_CHANNELS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <DateRangePicker
              startDate={startDate}
              endDate={endDate}
              onStartChange={(v) => setParam('startDate', v)}
              onEndChange={(v) => setParam('endDate', v)}
            />
          </FilterBar>
        }
        paginationSlot={
          !isLoading && rows.length > 0 ? (
            <CursorPagination
              loadedCount={rows.length}
              total={total}
              hasMore={!!hasNextPage}
              isLoadingMore={isFetchingNextPage}
              onLoadMore={() => fetchNextPage()}
            />
          ) : null
        }
      />
    </div>
  );
}

export default function OrdersPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <PageHeader title="Orders" />
          <DataTable columns={orderColumns} data={[]} isLoading />
        </div>
      }
    >
      <OrdersContent />
    </Suspense>
  );
}
