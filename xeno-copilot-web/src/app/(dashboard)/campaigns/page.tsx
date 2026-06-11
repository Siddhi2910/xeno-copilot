'use client';

import { Suspense, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Megaphone, Plus } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { CampaignCard } from '@/components/campaigns/CampaignCard';
import { CursorPagination } from '@/components/shared/CursorPagination';
import { AnimatedEmptyState } from '@/components/shared/AnimatedEmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { SkeletonCards } from '@/components/shared/SkeletonCards';
import { Button } from '@/components/ui/button';
import { useCampaigns } from '@/lib/hooks/useCampaigns';
import type { CampaignStatus } from '@/lib/types/campaign';
import { cn } from '@/lib/utils/cn';

const TABS: { key: string; label: string; status?: CampaignStatus }[] = [
  { key: '', label: 'All' },
  { key: 'DRAFT', label: 'Draft', status: 'DRAFT' },
  { key: 'ACTIVE', label: 'Active', status: 'ACTIVE' },
  { key: 'COMPLETED', label: 'Completed', status: 'COMPLETED' },
  { key: 'FAILED', label: 'Failed', status: 'FAILED' },
];

const EMPTY: Record<string, { heading: string; description: string; action?: { label: string; href: string } }> = {
  '': { heading: 'No campaigns yet', description: 'Create your first AI-powered campaign.', action: { label: 'Create Campaign', href: '/campaigns/new' } },
  DRAFT: { heading: 'No draft campaigns', description: 'Start building a new campaign.', action: { label: 'Create one', href: '/campaigns/new' } },
  ACTIVE: { heading: 'No active campaigns', description: 'Launch a campaign to see it here.' },
  COMPLETED: { heading: 'No completed campaigns', description: 'Completed campaigns will appear here.' },
  FAILED: { heading: 'No failed campaigns', description: 'Failed campaigns will appear here.' },
};

function CampaignsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get('status') ?? '';
  const status = TABS.find((t) => t.key === tab)?.status;

  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage, isError } = useCampaigns({ status });
  const rows = useMemo(() => data?.pages.flatMap((p) => p.data) ?? [], [data]);
  const total = data?.pages[0]?.pagination.total;

  const setTab = useCallback(
    (key: string) => {
      const params = new URLSearchParams();
      if (key) params.set('status', key);
      router.replace(`/campaigns?${params.toString()}`);
    },
    [router],
  );

  const empty = EMPTY[tab] ?? EMPTY[''];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Campaigns"
        actions={
          <Button asChild>
            <Link href="/campaigns/new"><Plus className="h-4 w-4" /> New Campaign</Link>
          </Button>
        }
      />
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2 dark:border-slate-800">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              tab === t.key ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400',
            )}
          >
            {t.label}
            {tab === t.key && total != null ? <span className="ml-1 opacity-75">({total})</span> : null}
          </button>
        ))}
      </div>
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"><SkeletonCards count={6} /></div>
      ) : isError ? (
        <ErrorState heading="Failed to load campaigns" description="Check your connection." onRetry={() => window.location.reload()} />
      ) : rows.length === 0 ? (
        <AnimatedEmptyState icon={Megaphone} heading={empty.heading} description={empty.description} action={empty.action} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((c) => <CampaignCard key={c._id} campaign={c} />)}
          </div>
          <CursorPagination
            loadedCount={rows.length}
            total={total}
            hasMore={!!hasNextPage}
            isLoadingMore={isFetchingNextPage}
            onLoadMore={() => fetchNextPage()}
          />
        </>
      )}
    </div>
  );
}

export default function CampaignsPage() {
  return (
    <Suspense fallback={<SkeletonCards count={6} />}>
      <CampaignsContent />
    </Suspense>
  );
}
