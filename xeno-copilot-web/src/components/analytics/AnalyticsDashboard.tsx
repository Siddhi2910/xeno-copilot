'use client';

import { Suspense, useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { BarChart3, Plus } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { DateRangePicker } from '@/components/forms/DateRangePicker';
import { ExecutiveSummary } from '@/components/analytics/ExecutiveSummary';
import { RecentCampaignsTable } from '@/components/analytics/RecentCampaignsTable';
import { RecentImportActivity } from '@/components/analytics/RecentImportActivity';
import { AnalyticsSkeleton } from '@/components/analytics/AnalyticsSkeleton';
import { DonutChart } from '@/components/charts/DonutChart';
import { SegmentBarChart } from '@/components/charts/SegmentBarChart';
import { RevenueTrendChart } from '@/components/charts/RevenueTrendChart';
import { CampaignRatesBar } from '@/components/charts/CampaignRatesBar';
import { ChannelPerformanceChart } from '@/components/charts/ChannelPerformanceChart';
import { FunnelChart } from '@/components/charts/FunnelChart';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { Button } from '@/components/ui/button';
import { useSegments } from '@/lib/hooks/useSegments';
import { useCampaigns } from '@/lib/hooks/useCampaigns';
import { useImportJobs } from '@/lib/hooks/useImportJobs';
import { useAnalyticsOrders } from '@/lib/hooks/useAnalyticsOrders';
import { useCampaignStatsBatch } from '@/lib/hooks/useCampaignStatsBatch';
import { formatCurrency } from '@/lib/utils/formatters';
import type { CampaignStats } from '@/lib/types/campaign';

function defaultRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function AnalyticsContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const defaults = defaultRange();
  const startDate = searchParams.get('startDate') ?? defaults.start;
  const endDate = searchParams.get('endDate') ?? defaults.end;

  const segmentsQ = useSegments();
  const activeQ = useCampaigns({ status: 'ACTIVE' });
  const completedQ = useCampaigns({ status: 'COMPLETED' });
  const draftQ = useCampaigns({ status: 'DRAFT' });
  const recentQ = useCampaigns({ limit: 5 });
  const importsQ = useImportJobs(5);
  const ordersQ = useAnalyticsOrders(startDate, endDate);

  const perfCampaigns = useMemo(() => {
    const active = activeQ.data?.pages.flatMap((p) => p.data) ?? [];
    const completed = completedQ.data?.pages.flatMap((p) => p.data) ?? [];
    return [...active, ...completed].slice(0, 6);
  }, [activeQ.data, completedQ.data]);

  const statsQueries = useCampaignStatsBatch(perfCampaigns.map((c) => c._id));
  const perfItems = useMemo(
    () =>
      perfCampaigns
        .map((c, i) => {
          const stats = statsQueries[i]?.data;
          return stats ? { name: c.name, stats } : null;
        })
        .filter((x): x is { name: string; stats: CampaignStats } => x != null),
    [perfCampaigns, statsQueries],
  );

  const aggregateFunnel = useMemo(() => {
    const stats = { sent: 0, delivered: 0, opened: 0, clicked: 0, converted: 0 };
    for (const item of perfItems) {
      stats.sent += item.stats.stats.sent;
      stats.delivered += item.stats.stats.delivered;
      stats.opened += item.stats.stats.opened;
      stats.clicked += item.stats.stats.clicked;
      stats.converted += item.stats.stats.converted;
    }
    const round = (n: number) => (stats.sent > 0 ? Math.round(n * 1000) / 10 : 0);
    const rates = {
      deliveryRate: stats.sent > 0 ? round(stats.delivered / stats.sent * 100) : 0,
      openRate: stats.delivered > 0 ? round(stats.opened / stats.delivered * 100) : 0,
      clickRate: stats.delivered > 0 ? round(stats.clicked / stats.delivered * 100) : 0,
      conversionRate: stats.delivered > 0 ? round(stats.converted / stats.delivered * 100) : 0,
    };
    return { stats, rates };
  }, [perfItems]);

  const channelMix = useMemo(() => {
    const mix: Record<string, number> = {};
    const all = [...(recentQ.data?.pages.flatMap((p) => p.data) ?? []), ...perfCampaigns];
    for (const c of all) {
      const cm = c.audienceSnapshot?.channelMix ?? {};
      for (const [ch, n] of Object.entries(cm)) mix[ch] = (mix[ch] ?? 0) + n;
    }
    return mix;
  }, [recentQ.data, perfCampaigns]);

  const orders = ordersQ.data?.data ?? [];
  const revenue = orders.reduce((s, o) => s + o.amount, 0);
  const avgCvr =
    perfItems.length > 0
      ? perfItems.reduce((s, p) => s + p.stats.rates.conversionRate, 0) / perfItems.length
      : undefined;

  const setRange = useCallback(
    (start: string, end: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (start) params.set('startDate', start);
      else params.delete('startDate');
      if (end) params.set('endDate', end);
      else params.delete('endDate');
      router.replace(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams],
  );

  const loading = segmentsQ.isLoading || activeQ.isLoading;
  const error = segmentsQ.isError || ordersQ.isError;

  if (loading) return <AnalyticsSkeleton />;

  if (error) {
    return (
      <ErrorState
        heading="Failed to load analytics"
        description="Check your connection and try again."
        onRetry={() => {
          segmentsQ.refetch();
          ordersQ.refetch();
        }}
      />
    );
  }

  const segData = segmentsQ.data;
  const segments = segData?.segments ?? [];
  const recent = recentQ.data?.pages.flatMap((p) => p.data).slice(0, 5) ?? [];
  const imports = importsQ.data?.data ?? [];

  const hasData = (segData?.totalCustomers ?? 0) > 0 || recent.length > 0;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Analytics"
        subtitle="Executive performance overview"
        actions={
          <Button asChild>
            <Link href="/campaigns/new"><Plus className="h-4 w-4" /> New Campaign</Link>
          </Button>
        }
      />

      <DateRangePicker
        startDate={startDate}
        endDate={endDate}
        onStartChange={(v) => setRange(v, endDate)}
        onEndChange={(v) => setRange(startDate, v)}
      />

      <ExecutiveSummary
        totalCustomers={segData?.totalCustomers ?? 0}
        activeCampaigns={activeQ.data?.pages[0]?.pagination.total ?? 0}
        completedCampaigns={completedQ.data?.pages[0]?.pagination.total ?? 0}
        drafts={draftQ.data?.pages[0]?.pagination.total ?? 0}
        revenue={revenue}
        orderCount={orders.length}
        avgConversion={avgCvr}
      />

      {!hasData ? (
        <EmptyState
          icon={BarChart3}
          heading="No analytics data yet"
          description="Import customers and orders, then launch campaigns to see insights."
          action={{ label: 'Go to Import', href: '/import' }}
        />
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-5">
            <div className="rounded-lg border border-slate-200 bg-white p-4 lg:col-span-3 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="mb-4 text-sm font-medium">Revenue Trend</h2>
              <RevenueTrendChart orders={orders} isLoading={ordersQ.isLoading} />
              <p className="mt-2 text-xs text-slate-400">Period total: {formatCurrency(revenue)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 lg:col-span-2 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="mb-4 text-sm font-medium">Conversion Funnel</h2>
              <FunnelChart stats={aggregateFunnel.stats} rates={aggregateFunnel.rates} />
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="mb-4 text-sm font-medium">Campaign Performance</h2>
              <CampaignRatesBar items={perfItems} isLoading={statsQueries.some((q) => q.isLoading)} />
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="mb-4 text-sm font-medium">Channel Performance</h2>
              <ChannelPerformanceChart channelMix={channelMix} />
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-5">
            <div className="rounded-lg border border-slate-200 bg-white p-4 lg:col-span-3 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="mb-2 text-sm font-medium">Segment Distribution</h2>
              <p className="mb-4 text-xs text-slate-500">Based on last RFM computation</p>
              <DonutChart segments={segments} totalCustomers={segData?.totalCustomers ?? 0} />
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 lg:col-span-2 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="mb-4 text-sm font-medium">Recent Activity</h2>
              <RecentImportActivity jobs={imports} />
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-5">
            <div className="rounded-lg border border-slate-200 bg-white p-4 lg:col-span-3 dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-medium">Recent Campaigns</h2>
                <Link href="/campaigns" className="text-xs text-indigo-600 hover:underline">View all →</Link>
              </div>
              <RecentCampaignsTable campaigns={recent} />
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 lg:col-span-2 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="mb-4 text-sm font-medium">Segment Revenue Snapshot</h2>
              <SegmentBarChart segments={segments} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function AnalyticsDashboard() {
  return (
    <Suspense fallback={<AnalyticsSkeleton />}>
      <AnalyticsContent />
    </Suspense>
  );
}
