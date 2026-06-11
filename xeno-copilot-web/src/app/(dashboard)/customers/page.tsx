'use client';

import { Suspense, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Users } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable } from '@/components/tables/DataTable';
import { SearchInput } from '@/components/forms/SearchInput';
import { FilterBar } from '@/components/forms/FilterBar';
import { CursorPagination } from '@/components/shared/CursorPagination';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { customerColumns } from '@/components/customers/columns';
import { useCustomers } from '@/lib/hooks/useCustomers';
import { RFM_SEGMENTS } from '@/lib/constants/segments';
import { COMM_CHANNELS } from '@/lib/constants/channels';
import type { Channel, RfmSegment } from '@/lib/types/customer';

function CustomersContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const search = searchParams.get('search') ?? '';
  const segment = (searchParams.get('segment') ?? '') as RfmSegment | '';
  const channel = (searchParams.get('channel') ?? '') as Channel | '';

  const filters = useMemo(
    () => ({
      search: search || undefined,
      rfmSegment: segment || undefined,
      channel: channel || undefined,
    }),
    [search, segment, channel],
  );

  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage, isError } = useCustomers(filters);

  const rows = useMemo(() => data?.pages.flatMap((p) => p.data) ?? [], [data]);
  const total = data?.pages[0]?.pagination.total;

  const setParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) params.set(key, value);
      else params.delete(key);
      router.replace(`/customers?${params.toString()}`);
    },
    [router, searchParams],
  );

  const activeCount = [search, segment, channel].filter(Boolean).length;

  const clearFilters = () => router.replace('/customers');

  return (
    <div className="space-y-6">
      <PageHeader title="Customers" subtitle="Browse and search your customer base" />

      <DataTable
        columns={customerColumns}
        data={rows}
        isLoading={isLoading}
        emptyState={
          isError ? (
            <ErrorState heading="Failed to load customers" description="Check your connection and try again." onRetry={() => window.location.reload()} />
          ) : (
            <EmptyState
              icon={Users}
              heading="No customers found"
              description={activeCount ? 'Try adjusting your filters.' : 'Import customers to get started.'}
              action={activeCount ? { label: 'Clear filters', onClick: clearFilters } : undefined}
            />
          )
        }
        filterBar={
          <FilterBar activeCount={activeCount} onClear={activeCount ? clearFilters : undefined}>
            <SearchInput
              value={search}
              onChange={(v) => setParam('search', v)}
              placeholder="Search by name, phone, email…"
              className="w-full sm:w-72"
            />
            <select
              value={segment}
              onChange={(e) => setParam('segment', e.target.value)}
              className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="">All Segments</option>
              {RFM_SEGMENTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <select
              value={channel}
              onChange={(e) => setParam('channel', e.target.value)}
              className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="">All Channels</option>
              {COMM_CHANNELS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
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

export default function CustomersPage() {
  return (
    <Suspense fallback={<div className="space-y-6"><PageHeader title="Customers" /><DataTable columns={customerColumns} data={[]} isLoading /></div>}>
      <CustomersContent />
    </Suspense>
  );
}
