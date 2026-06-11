'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Lightbulb, Users } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { MetricCard } from '@/components/shared/MetricCard';
import { DataTable } from '@/components/tables/DataTable';
import { SearchInput } from '@/components/forms/SearchInput';
import { CursorPagination } from '@/components/shared/CursorPagination';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { RfmSegmentBadge } from '@/components/shared/RfmSegmentBadge';
import { ChannelReachIndicator } from '@/components/segments/ChannelReachIndicator';
import { segmentCustomerColumns } from '@/components/segments/columns';
import { Button } from '@/components/ui/button';
import { SkeletonCards } from '@/components/shared/SkeletonCards';
import {
  CAMPAIGN_SUGGESTIONS,
  SEGMENT_DESCRIPTIONS,
  SEGMENT_HERO_BG,
  RFM_SEGMENTS,
} from '@/lib/constants/segments';
import { useSegmentCustomers } from '@/lib/hooks/useSegmentCustomers';
import type { SegmentAggregate } from '@/lib/types/segment';
import type { RfmSegment } from '@/lib/types/customer';
import { formatCurrency, formatNumber } from '@/lib/utils/formatters';

interface AudienceExplorerProps {
  segmentName: RfmSegment;
  stats?: SegmentAggregate;
  statsLoading?: boolean;
}

export function AudienceExplorer({ segmentName, stats, statsLoading }: AudienceExplorerProps) {
  const [search, setSearch] = useState('');
  const label = RFM_SEGMENTS.find((s) => s.value === segmentName)?.label ?? segmentName;

  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage, isError } =
    useSegmentCustomers(segmentName);

  const rows = useMemo(() => data?.pages.flatMap((p) => p.data) ?? [], [data]);
  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(
      (c) => c.name.toLowerCase().includes(q) || c.phone.includes(q) || (c.email?.toLowerCase().includes(q) ?? false),
    );
  }, [rows, search]);

  const total = data?.pages[0]?.pagination.total ?? stats?.count ?? 0;

  return (
    <div className="space-y-6">
      <div className={SEGMENT_HERO_BG[segmentName] + ' -mx-4 rounded-lg px-4 py-6 sm:-mx-6 sm:px-6'}>
        <PageHeader
          title={label}
          subtitle={SEGMENT_DESCRIPTIONS[segmentName]}
          actions={
            <Button asChild variant="outline" size="sm">
              <Link href="/segments">
                <ArrowLeft className="h-4 w-4" />
                Back to Segments
              </Link>
            </Button>
          }
        />
        <div className="mt-3">
          <RfmSegmentBadge segment={segmentName} />
        </div>
      </div>

      {statsLoading ? (
        <SkeletonCards count={4} />
      ) : stats ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Customer Count" value={formatNumber(stats.count)} variant="featured" />
          <MetricCard label="Avg Spend" value={formatCurrency(stats.avgSpend)} />
          <MetricCard label="Avg Order Frequency" value={stats.avgOrderFrequency} />
          <MetricCard label="Avg Days Since Last Order" value={stats.avgDaysSinceLastOrder} />
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-5 dark:border-amber-900 dark:bg-amber-950/20 lg:col-span-2">
          <div className="flex items-start gap-3">
            <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="flex-1">
              <p className="font-medium text-slate-900 dark:text-slate-100">Create a campaign for this segment</p>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{CAMPAIGN_SUGGESTIONS[segmentName]}</p>
              <Button asChild size="sm" className="mt-3">
                <Link href="/campaigns/new">Create Campaign</Link>
              </Button>
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <ChannelReachIndicator customers={rows} totalCount={total} />
        </div>
      </div>

      <DataTable
        columns={segmentCustomerColumns}
        data={filtered}
        isLoading={isLoading}
        emptyState={
          isError ? (
            <ErrorState heading="Failed to load customers" description="Check your connection and try again." onRetry={() => window.location.reload()} />
          ) : stats?.count === 0 ? (
            <EmptyState
              icon={Users}
              heading="No customers in this segment yet"
              description="RFM scores are computed after order data is imported."
              action={{ label: 'Go to Import', href: '/import' }}
            />
          ) : (
            <EmptyState
              icon={Users}
              heading="No results match your search"
              description="Try broadening your search."
              action={search ? { label: 'Clear search', onClick: () => setSearch('') } : undefined}
            />
          )
        }
        filterBar={
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search customers in segment…"
            className="max-w-sm"
          />
        }
        paginationSlot={
          !isLoading && rows.length > 0 && !search ? (
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
