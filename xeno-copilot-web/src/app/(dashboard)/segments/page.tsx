'use client';

import { Suspense, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PieChart } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { DonutChart } from '@/components/charts/DonutChart';
import { SegmentBarChart } from '@/components/charts/SegmentBarChart';
import { AudiencePreview } from '@/components/segments/AudiencePreview';
import { SegmentCard } from '@/components/segments/SegmentCard';
import { SegmentStatsTable } from '@/components/segments/SegmentStatsTable';
import { SegmentsPageSkeleton } from '@/components/segments/SegmentsPageSkeleton';
import { FilterBar } from '@/components/forms/FilterBar';
import { useSegments } from '@/lib/hooks/useSegments';
import { RFM_SEGMENTS } from '@/lib/constants/segments';
import type { RfmSegment } from '@/lib/types/customer';

function SegmentsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const highlight = (searchParams.get('segment') ?? '') as RfmSegment | '';

  const { data, isLoading, isError } = useSegments();

  const segments = useMemo(() => data?.segments ?? [], [data?.segments]);
  const filteredCards = useMemo(
    () => (highlight ? segments.filter((s) => s.segment === highlight) : segments),
    [segments, highlight],
  );

  const setSegment = useCallback(
    (segment: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (segment) params.set('segment', segment);
      else params.delete('segment');
      router.replace(`/segments?${params.toString()}`);
    },
    [router, searchParams],
  );

  if (isLoading) return <SegmentsPageSkeleton />;

  if (isError || !data) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <ErrorState heading="Failed to load segments" description="Check your connection and try again." onRetry={() => window.location.reload()} />
      </div>
    );
  }

  const totalSegmented = segments.reduce((s, seg) => s + seg.count, 0);

  return (
    <div className="space-y-8">
      <PageHeader title="Customer Segments" subtitle="RFM-based audience intelligence" />

      <AudiencePreview data={data} highlightSegment={highlight || null} />

      <FilterBar activeCount={highlight ? 1 : 0} onClear={highlight ? () => setSegment('') : undefined}>
        <select
          value={highlight}
          onChange={(e) => setSegment(e.target.value)}
          className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
        >
          <option value="">All Segments</option>
          {RFM_SEGMENTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </FilterBar>

      {totalSegmented === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <EmptyState
            icon={PieChart}
            heading="No customers in segments yet"
            description="RFM scores are computed after order data is imported."
            action={{ label: 'Go to Import', href: '/import' }}
          />
        </div>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="mb-4 text-sm font-medium text-slate-900 dark:text-slate-100">Distribution</h2>
              <DonutChart
                segments={segments}
                totalCustomers={data.totalCustomers}
                activeSegment={highlight || null}
              />
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="mb-4 text-sm font-medium text-slate-900 dark:text-slate-100">Segment Stats</h2>
              <SegmentStatsTable
                segments={segments}
                activeSegment={highlight || null}
                onSegmentClick={(seg) => setSegment(seg === highlight ? '' : seg)}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredCards.map((s) => (
              <SegmentCard
                key={s.segment}
                segment={s}
                active={highlight === s.segment}
                onSelect={() => setSegment(s.segment === highlight ? '' : s.segment)}
              />
            ))}
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-4 text-sm font-medium text-slate-900 dark:text-slate-100">Segment Comparison</h2>
            <SegmentBarChart segments={segments} activeSegment={highlight || null} />
          </div>
        </>
      )}
    </div>
  );
}

export default function SegmentsPage() {
  return (
    <Suspense fallback={<SegmentsPageSkeleton />}>
      <SegmentsContent />
    </Suspense>
  );
}
