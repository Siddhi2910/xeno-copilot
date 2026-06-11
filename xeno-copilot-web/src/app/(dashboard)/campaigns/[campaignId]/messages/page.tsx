'use client';

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Mail } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable } from '@/components/tables/DataTable';
import { CursorPagination } from '@/components/shared/CursorPagination';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { messageColumns } from '@/components/campaigns/messagesColumns';
import { Button } from '@/components/ui/button';
import { useCampaign } from '@/lib/hooks/useCampaign';
import { useCampaignMessages } from '@/lib/hooks/useCampaignMessages';
import type { MessageStatus } from '@/lib/types/campaign';

const STATUSES: (MessageStatus | '')[] = ['', 'QUEUED', 'SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'FAILED'];

function MessagesContent({ campaignId }: { campaignId: string }) {
  const { data: campaign } = useCampaign(campaignId);
  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage, isError, refetch } = useCampaignMessages(campaignId);
  const [statusFilter, setStatusFilter] = useState<MessageStatus | ''>('');

  const rows = useMemo(() => {
    const all = data?.pages.flatMap((p) => p.data) ?? [];
    if (!statusFilter) return all;
    return all.filter((m) => m.status === statusFilter);
  }, [data, statusFilter]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${campaign?.name ?? 'Campaign'} — Messages`}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href={`/campaigns/${campaignId}`}><ArrowLeft className="h-4 w-4" /> Back</Link>
          </Button>
        }
      />
      <DataTable
        columns={messageColumns}
        data={rows}
        isLoading={isLoading}
        emptyState={
          isError ? (
            <ErrorState heading="Failed to load messages" onRetry={() => refetch()} />
          ) : (
            <EmptyState icon={Mail} heading="No messages" description="Messages appear after campaign launch." />
          )
        }
        filterBar={
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as MessageStatus | '')}
            className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            {STATUSES.map((s) => (
              <option key={s || 'all'} value={s}>{s || 'All Statuses'}</option>
            ))}
          </select>
        }
        paginationSlot={
          !isLoading && rows.length > 0 && !statusFilter ? (
            <CursorPagination
              loadedCount={rows.length}
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

export default function CampaignMessagesPage({ params }: { params: { campaignId: string } }) {
  return (
    <Suspense fallback={<DataTable columns={messageColumns} data={[]} isLoading />}>
      <MessagesContent campaignId={params.campaignId} />
    </Suspense>
  );
}
